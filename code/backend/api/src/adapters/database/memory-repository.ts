import type { Client, Transaction } from '@libsql/client';
import { randomUUID, createHash } from 'node:crypto';
import type { MemoryRepository } from '../../ports/memory-repository.ts';
import {
  FactSchema,
  SummarySchema,
  normalizeMemory,
  canonicalMemoryRelation,
  memoryEquivalenceKey,
  strongestDataClass,
  type FactInput,
  type MemoryFact,
  type MemoryPolicy,
  type MemorySource,
} from '../../domain/memory/model.ts';
import { NotFoundError } from '../../domain/errors/resources.ts';
import { ProviderBusyError } from '../../domain/errors/providers.ts';

type Executor = Pick<Client, 'execute'>;
const fingerprint = (text: string) =>
  createHash('sha256').update(normalizeMemory(text)).digest('hex');

export function createMemoryRepository(
  client: Client,
  ownerId: string,
): MemoryRepository {
  let writes = Promise.resolve();

  async function write<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const pending = writes.then(async () => {
      const tx = await client.transaction('write');

      try {
        const result = await operation(tx);
        await tx.commit();

        return result;
      } catch (error) {
        await tx.rollback();

        throw error;
      } finally {
        tx.close();
      }
    });
    writes = pending.then(
      () => undefined,
      () => undefined,
    );

    return pending;
  }

  async function ensure(db: Executor) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO memory_policy(owner_id) VALUES (?)',
      args: [ownerId],
    });
  }

  async function policy(db: Executor = client): Promise<MemoryPolicy> {
    await ensure(db);
    const { rows } = await db.execute({
      sql: 'SELECT * FROM memory_policy WHERE owner_id = ?',
      args: [ownerId],
    });
    const row = rows[0]!;

    return {
      revision: Number(row.revision),
      enabled: Boolean(row.enabled),
      personalEnabled: Boolean(row.personal_enabled),
      autoApprove: Boolean(row.auto_approve),
      extraction: String(row.extraction) as MemoryPolicy['extraction'],
      retentionDays:
        row.retention_days === null ? null : Number(row.retention_days),
    };
  }

  async function bump(db: Executor) {
    await ensure(db);
    await db.execute({
      sql: 'UPDATE memory_policy SET epoch = epoch + 1 WHERE owner_id = ?',
      args: [ownerId],
    });
  }

  async function requireConversation(db: Executor, id: string) {
    const { rows } = await db.execute({
      sql: 'SELECT id FROM foundation_conversations WHERE id = ? AND owner_id = ?',
      args: [id, ownerId],
    });

    if (!rows.length) {
      throw new NotFoundError();
    }
  }

  async function facts(
    db: Executor = client,
    ids?: string[],
  ): Promise<MemoryFact[]> {
    if (ids?.length === 0) {
      return [];
    }

    const selection = ids
      ? ` AND f.id IN (${ids.map(() => '?').join(',')})`
      : '';
    const { rows } = await db.execute({
      sql: `SELECT f.*, s.label AS subject, r.predicate, o.label AS object FROM memory_facts f LEFT JOIN memory_relations r ON r.fact_id = f.id LEFT JOIN memory_entities s ON s.id = r.subject_id LEFT JOIN memory_entities o ON o.id = r.object_id WHERE f.owner_id = ?${selection} ORDER BY f.updated_at DESC, f.id`,
      args: [ownerId, ...(ids ?? [])],
    });
    const sources = await db.execute({
      sql:
        'SELECT s.fact_id, s.turn_id, s.evidence, t.conversation_id FROM memory_fact_sources s JOIN memory_facts f ON f.id = s.fact_id JOIN call_turns t ON t.id = s.turn_id WHERE f.owner_id = ?' +
        selection,
      args: [ownerId, ...(ids ?? [])],
    });

    return rows.map((row) =>
      FactSchema.parse({
        id: row.id,
        text: row.text,
        category: row.category,
        status: row.status,
        dataClass: row.data_class,
        permission: row.permission,
        version: Number(row.version),
        origin: row.origin,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        kind: row.kind,
        expiresAt: row.expires_at === null ? null : Number(row.expires_at),
        supersedes: row.supersedes_id
          ? {
              factId: row.supersedes_id,
              version: Number(row.supersedes_version),
            }
          : null,
        relation: row.predicate
          ? {
              subject: row.subject,
              predicate: row.predicate,
              object: row.object,
            }
          : null,
        sources: sources.rows
          .filter((s) => s.fact_id === row.id)
          .map((s) => ({
            turnId: s.turn_id,
            conversationId: s.conversation_id,
            evidence: s.evidence,
          })),
      }),
    );
  }

  async function fact(db: Executor, id: string, version?: number) {
    const found = (await facts(db, [id]))[0];

    if (!found) {
      throw new NotFoundError();
    }

    if (version !== undefined && found.version !== version) {
      throw new ProviderBusyError(
        'A memória mudou; consulte sua versão atual.',
      );
    }

    return found;
  }

  async function relation(
    db: Executor,
    factId: string,
    input: FactInput['relation'],
  ) {
    input = canonicalMemoryRelation(input);
    await db.execute({
      sql: 'DELETE FROM memory_relations WHERE fact_id = ?',
      args: [factId],
    });

    if (!input) {
      return;
    }

    const ids: string[] = [];

    for (const label of [input.subject, input.object]) {
      const normalized = normalizeMemory(label);

      if (!normalized) {
        throw new ProviderBusyError(
          'Uma entidade precisa conter letras ou números.',
        );
      }

      await db.execute({
        sql: 'INSERT OR IGNORE INTO memory_entities VALUES (?, ?, ?, ?)',
        args: [randomUUID(), ownerId, label, normalized],
      });
      const { rows } = await db.execute({
        sql: 'SELECT id FROM memory_entities WHERE owner_id = ? AND normalized = ?',
        args: [ownerId, normalized],
      });
      ids.push(String(rows[0]!.id));
    }

    await db.execute({
      sql: 'INSERT INTO memory_relations VALUES (?, ?, ?, ?)',
      args: [factId, ids[0]!, input.predicate, ids[1]!],
    });
  }

  async function cleanupEntities(db: Executor) {
    await db.execute({
      sql: 'DELETE FROM memory_entities WHERE owner_id = ? AND id NOT IN (SELECT subject_id FROM memory_relations UNION SELECT object_id FROM memory_relations)',
      args: [ownerId],
    });
  }

  async function insertFact(
    db: Executor,
    input: FactInput,
    status: 'suggested' | 'confirmed',
    origin: MemoryFact['origin'],
  ) {
    input = { ...input, relation: canonicalMemoryRelation(input.relation) };
    const hash = fingerprint(input.text);
    const blocked = await db.execute({
      sql: 'SELECT 1 FROM memory_tombstones WHERE owner_id = ? AND fingerprint = ?',
      args: [ownerId, hash],
    });

    if (blocked.rows.length && origin !== 'user') {
      return null;
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM memory_facts WHERE owner_id = ? AND fingerprint = ?',
      args: [ownerId, hash],
    });

    if (existing.rows.length) {
      return String(existing.rows[0]!.id);
    }

    const equivalence = memoryEquivalenceKey(input);

    if (equivalence) {
      const equivalent = await db.execute({
        sql: "SELECT id FROM memory_facts WHERE owner_id = ? AND equivalence_key = ? AND data_class = ? AND status <> 'superseded' ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END, created_at, id LIMIT 1",
        args: [ownerId, equivalence, input.dataClass],
      });

      if (equivalent.rows.length) {
        return String(equivalent.rows[0]!.id);
      }
    }

    const id = randomUUID();
    await db.execute({
      sql: 'INSERT INTO memory_facts(id, owner_id, text, category, status, data_class, permission, version, fingerprint, origin, created_at, updated_at, search_text, kind, expires_at, supersedes_id, supersedes_version, equivalence_key) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        id,
        ownerId,
        input.text,
        input.category,
        status,
        input.dataClass,
        input.permission,
        hash,
        origin,
        Date.now(),
        Date.now(),
        normalizeMemory(
          input.text +
            ' ' +
            input.category +
            ' ' +
            JSON.stringify(input.relation),
        ),
        input.kind,
        input.expiresAt,
        input.supersedes?.factId ?? null,
        input.supersedes?.version ?? null,
        equivalence,
      ],
    });
    await relation(db, id, input.relation);

    return id;
  }

  async function invalidateSources(
    db: Executor,
    turnIds: string[],
    reason: string,
    protectedFactIds: string[] = [],
  ) {
    for (const id of turnIds) {
      await db.execute({
        sql: 'INSERT OR REPLACE INTO memory_blocked_turns VALUES (?, ?, ?)',
        args: [ownerId, id, reason],
      });
      await db.execute({
        sql: 'DELETE FROM memory_summaries WHERE job_id IN (SELECT job_id FROM memory_job_sources WHERE turn_id = ?) AND owner_id = ?',
        args: [id, ownerId],
      });
      await db.execute({
        sql: `DELETE FROM memory_facts WHERE owner_id = ? AND origin <> 'user' AND id IN (SELECT fact_id FROM memory_fact_sources WHERE turn_id = ?)${protectedFactIds.length ? ` AND id NOT IN (${protectedFactIds.map(() => '?').join(',')})` : ''}`,
        args: [ownerId, id, ...protectedFactIds],
      });
      await db.execute({
        sql: "UPDATE memory_fact_sources SET evidence = '[fonte invalidada para recuperação]' WHERE turn_id = ? AND fact_id IN (SELECT id FROM memory_facts WHERE owner_id = ?)",
        args: [id, ownerId],
      });
    }

    await cleanupEntities(db);
  }

  async function sources(
    db: Executor,
    condition: string,
    args: (string | number)[],
  ): Promise<MemorySource[]> {
    const { rows } = await db.execute({
      sql: `SELECT t.*, COALESCE((SELECT GROUP_CONCAT(text, ' ') FROM (SELECT text FROM speech_segments WHERE response_id = t.response_id AND sample_count > 0 AND played_samples = sample_count ORDER BY position)), '') AS heard, EXISTS(SELECT 1 FROM speech_segments WHERE response_id = t.response_id AND played_samples > 0 AND played_samples < sample_count) AS partial FROM call_turns t JOIN foundation_conversations c ON c.id = t.conversation_id WHERE c.owner_id = ? AND ${condition} ORDER BY t.created_at, t.rowid`,
      args: [ownerId, ...args],
    });

    return rows.map((r) => ({
      createdAt: Number(r.created_at),
      id: String(r.id),
      conversationId: String(r.conversation_id),
      userText: String(r.user_text),
      assistantConfirmed: String(r.heard),
      partiallyPlayed: Boolean(r.partial),
      responseStatus: String(r.status),
      dataClass: String(r.data_class) as MemorySource['dataClass'],
    }));
  }

  async function applyCorrection(
    db: Executor,
    id: string,
    input: FactInput,
    automatic = false,
  ) {
    if (!input.supersedes) {
      return;
    }

    if (input.kind !== 'correction' || input.supersedes.factId === id) {
      throw new ProviderBusyError('Alvo de correção inválido.');
    }

    const previous = await fact(
      db,
      input.supersedes.factId,
      input.supersedes.version,
    );

    if (previous.status !== 'confirmed') {
      throw new ProviderBusyError(
        'O alvo da correção precisa estar confirmado na versão revisada.',
      );
    }

    await db.execute({
      sql: 'INSERT OR IGNORE INTO memory_tombstones VALUES (?, ?, ?)',
      args: [ownerId, fingerprint(previous.text), Date.now()],
    });

    if (!automatic) {
      await db.execute({
        sql: "UPDATE memory_facts SET origin = 'user' WHERE id IN (?, ?)",
        args: [id, previous.id],
      });
    }

    await invalidateSources(
      db,
      previous.sources.map((s) => s.turnId),
      'superseded',
      [id, previous.id],
    );
    await db.execute({
      sql: "UPDATE memory_facts SET status = 'superseded', version = version + 1, updated_at = ? WHERE id = ?",
      args: [Date.now(), previous.id],
    });
    await db.execute({
      sql: 'DELETE FROM memory_relations WHERE fact_id = ?',
      args: [previous.id],
    });
    await db.execute({
      sql: 'UPDATE memory_facts SET data_class = ? WHERE id = ?',
      args: [strongestDataClass([input.dataClass, previous.dataClass]), id],
    });
  }

  async function deleteConversation(db: Executor, id: string) {
    await requireConversation(db, id);
    const active = await db.execute({
      sql: 'SELECT 1 FROM call_sessions WHERE conversation_id = ? AND ended_at IS NULL',
      args: [id],
    });

    if (active.rows.length) {
      throw new ProviderBusyError(
        'Encerre a chamada antes de excluir a conversa.',
      );
    }

    // A confirmed fact with surviving sources becomes a suggestion for review.
    await db.execute({
      sql: "UPDATE memory_facts SET status = 'suggested', version = version + 1, updated_at = ? WHERE owner_id = ? AND origin <> 'user' AND id IN (SELECT fact_id FROM memory_fact_sources s JOIN call_turns t ON t.id = s.turn_id WHERE t.conversation_id = ?)",
      args: [Date.now(), ownerId, id],
    });
    await db.execute({
      sql: 'DELETE FROM memory_fact_sources WHERE turn_id IN (SELECT id FROM call_turns WHERE conversation_id = ?)',
      args: [id],
    });
    await db.execute({
      sql: "DELETE FROM memory_facts WHERE owner_id = ? AND origin <> 'user' AND NOT EXISTS (SELECT 1 FROM memory_fact_sources WHERE fact_id = memory_facts.id)",
      args: [ownerId],
    });

    for (const sql of [
      'DELETE FROM memory_resumptions WHERE session_id IN (SELECT id FROM call_sessions WHERE conversation_id = ?)',
      'DELETE FROM memory_summaries WHERE conversation_id = ?',
      'DELETE FROM memory_jobs WHERE conversation_id = ?',
      'DELETE FROM memory_work_pending WHERE conversation_id = ?',
      'DELETE FROM speech_segments WHERE response_id IN (SELECT response_id FROM call_turns WHERE conversation_id = ?)',
      'DELETE FROM call_turns WHERE conversation_id = ?',
      'DELETE FROM call_sessions WHERE conversation_id = ?',
      'DELETE FROM foundation_conversations WHERE id = ?',
    ]) {
      await db.execute({ sql, args: [id] });
    }

    await cleanupEntities(db);
    await bump(db);
  }

  const repository: MemoryRepository = {
    policy,
    async updatePolicy(input) {
      return write(async (tx) => {
        const current = await policy(tx);

        if (current.revision !== input.revision) {
          throw new ProviderBusyError(
            'A política mudou; consulte a revisão atual.',
          );
        }

        await tx.execute({
          sql: 'UPDATE memory_policy SET revision = revision + 1, enabled = ?, personal_enabled = ?, extraction = ?, retention_days = ?, auto_approve = ?, epoch = epoch + 1 WHERE owner_id = ?',
          args: [
            Number(input.enabled),
            Number(input.personalEnabled),
            input.extraction,
            input.retentionDays,
            Number(input.autoApprove),
            ownerId,
          ],
        });

        return policy(tx);
      });
    },
    facts,
    async candidateFacts(terms, dataClass) {
      if (!terms.length) {
        return [];
      }

      const eligible =
        "f.owner_id = ? AND f.status = 'confirmed' AND (f.expires_at IS NULL OR f.expires_at > ?) AND (? = 'local-only' OR (f.permission = 'eligible' AND f.data_class <> 'local-only' AND (? = 'personal' OR f.data_class = 'synthetic')))";
      const eligibilityArgs = [ownerId, Date.now(), dataClass, dataClass];
      const { rows } = await client.execute({
        sql: `SELECT f.id FROM memory_facts f WHERE ${eligible} AND (${terms.map(() => 'instr(f.search_text, ?) > 0').join(' OR ')}) ORDER BY f.updated_at DESC LIMIT 40`,
        args: [...eligibilityArgs, ...terms],
      });
      const ids = new Set(rows.map((r) => String(r.id)));
      let frontier = [...ids];

      for (
        let depth = 0;
        depth < 2 && frontier.length && ids.size < 120;
        depth++
      ) {
        const placeholders = frontier.map(() => '?').join(',');
        const { rows: entities } = await client.execute({
          sql: `SELECT e.id FROM memory_entities e WHERE e.owner_id = ? AND e.normalized <> 'usuario' AND e.id IN (SELECT subject_id FROM memory_relations WHERE fact_id IN (${placeholders}) UNION SELECT object_id FROM memory_relations WHERE fact_id IN (${placeholders})) LIMIT 80`,
          args: [ownerId, ...frontier, ...frontier],
        });
        const entityIds = entities.map((r) => String(r.id));

        if (!entityIds.length) {
          break;
        }

        const nodes = entityIds.map(() => '?').join(',');
        const related = await client.execute({
          sql: `SELECT f.id FROM memory_facts f JOIN memory_relations r ON r.fact_id = f.id WHERE ${eligible} AND (r.subject_id IN (${nodes}) OR r.object_id IN (${nodes})) ORDER BY f.updated_at DESC LIMIT 80`,
          args: [...eligibilityArgs, ...entityIds, ...entityIds],
        });
        frontier = related.rows
          .map((r) => String(r.id))
          .filter((id) => !ids.has(id));

        for (const id of frontier) {
          if (ids.size < 120) {
            ids.add(id);
          }
        }
      }

      return facts(client, [...ids]);
    },
    async createFact(input) {
      return write(async (tx) => {
        const id = await insertFact(tx, input, 'confirmed', 'user');
        const current = await fact(tx, id!);

        if (
          current.status !== 'confirmed' ||
          current.origin !== 'user' ||
          current.permission !== input.permission ||
          current.dataClass !== input.dataClass
        ) {
          throw new ProviderBusyError(
            'Esse fato já existe; confirme ou edite sua versão atual.',
          );
        }

        await bump(tx);
        await applyCorrection(tx, id!, input);

        return fact(tx, id!);
      });
    },
    async editFact(id, version, input) {
      input = { ...input, relation: canonicalMemoryRelation(input.relation) };

      return write(async (tx) => {
        const previous = await fact(tx, id, version);
        const changed =
          previous.text !== input.text ||
          JSON.stringify(previous.relation) !== JSON.stringify(input.relation);
        const duplicate = await tx.execute({
          sql: 'SELECT id FROM memory_facts WHERE owner_id = ? AND fingerprint = ? AND id <> ?',
          args: [ownerId, fingerprint(input.text), id],
        });

        if (duplicate.rows.length) {
          throw new ProviderBusyError(
            'Já existe um fato com esse conteúdo; revise o registro existente.',
          );
        }

        const equivalence = memoryEquivalenceKey(input);

        if (equivalence) {
          const equivalent = await tx.execute({
            sql: "SELECT id FROM memory_facts WHERE owner_id = ? AND equivalence_key = ? AND data_class = ? AND id <> ? AND status <> 'superseded' LIMIT 1",
            args: [
              ownerId,
              equivalence,
              strongestDataClass([previous.dataClass, input.dataClass]),
              id,
            ],
          });

          if (equivalent.rows.length) {
            throw new ProviderBusyError(
              'Já existe uma preferência equivalente; revise ou consolide os registros existentes.',
            );
          }
        }

        const revoked =
          (previous.permission === 'eligible' &&
            input.permission === 'local-only') ||
          (previous.status === 'confirmed' && input.status === 'suggested');

        if (changed || revoked) {
          // Mark edited facts as user-authored; automatic extraction cannot replace them.
          await tx.execute({
            sql: 'INSERT OR IGNORE INTO memory_tombstones VALUES (?, ?, ?)',
            args: [ownerId, fingerprint(previous.text), Date.now()],
          });
          await tx.execute({
            sql: "UPDATE memory_facts SET status = 'confirmed', origin = 'user' WHERE id = ?",
            args: [id],
          });
          await invalidateSources(
            tx,
            previous.sources.map((s) => s.turnId),
            'corrected',
          );
        }

        await tx.execute({
          sql: 'UPDATE memory_facts SET text = ?, category = ?, status = ?, data_class = ?, permission = ?, version = version + 1, fingerprint = ?, updated_at = ?, search_text = ?, kind = ?, expires_at = ?, supersedes_id = ?, supersedes_version = ?, equivalence_key = ? WHERE id = ? AND owner_id = ?',
          args: [
            input.text,
            input.category,
            input.status,
            strongestDataClass([previous.dataClass, input.dataClass]),
            input.permission,
            fingerprint(input.text),
            Date.now(),
            normalizeMemory(
              input.text +
                ' ' +
                input.category +
                ' ' +
                JSON.stringify(input.relation),
            ),
            input.kind,
            input.expiresAt,
            input.supersedes?.factId ?? null,
            input.supersedes?.version ?? null,
            memoryEquivalenceKey(input),
            id,
            ownerId,
          ],
        });

        if (input.status === 'confirmed' && previous.status !== 'confirmed') {
          await applyCorrection(tx, id, input);
        }

        await relation(tx, id, input.relation);
        await cleanupEntities(tx);
        await bump(tx);

        return fact(tx, id);
      });
    },
    async consolidate() {
      return write(async (tx) => {
        const rows = (await facts(tx)).filter((f) => f.status !== 'superseded');
        const groups = new Map<string, MemoryFact[]>();

        for (const row of rows) {
          const key = memoryEquivalenceKey(row);

          if (key) {
            const group = JSON.stringify([key, row.dataClass]);
            groups.set(group, [...(groups.get(group) ?? []), row]);
          }
        }

        let merged = 0;
        let skipped = 0;

        for (const group of groups.values()) {
          if (group.length < 2) {
            continue;
          }

          const confirmed = group.filter((f) => f.status === 'confirmed');

          // Distinct explicit permissions are never combined implicitly.
          if (new Set(confirmed.map((f) => f.permission)).size > 1) {
            skipped += group.length - 1;
            continue;
          }

          const target = (confirmed.length ? confirmed : group).toSorted(
            (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
          )[0]!;
          const references = await tx.execute({
            sql: `SELECT 1 FROM memory_facts WHERE supersedes_id IN (${group.map(() => '?').join(',')}) LIMIT 1`,
            args: group.map((f) => f.id),
          });

          if (references.rows.length) {
            skipped += group.length - 1;
            continue;
          }

          for (const duplicate of group.filter((f) => f.id !== target.id)) {
            await tx.execute({
              sql: 'INSERT OR IGNORE INTO memory_fact_sources SELECT ?, turn_id, evidence FROM memory_fact_sources WHERE fact_id = ?',
              args: [target.id, duplicate.id],
            });
            await tx.execute({
              sql: 'DELETE FROM memory_facts WHERE id = ? AND owner_id = ?',
              args: [duplicate.id, ownerId],
            });
            merged++;
          }

          await tx.execute({
            sql: 'UPDATE memory_facts SET version = version + 1, updated_at = ? WHERE id = ?',
            args: [Date.now(), target.id],
          });
        }

        if (merged) {
          await cleanupEntities(tx);
          await bump(tx);
        }

        return { merged, skipped };
      });
    },
    async forgetFact(id, version, eraseSources) {
      return write(async (tx) => {
        const previous = await fact(tx, id, version);
        const matching = await sources(tx, 't.user_text <> ?', ['']);
        const turnIds = [
          ...new Set([
            ...previous.sources.map((source) => source.turnId),
            ...matching
              .filter(
                (source) =>
                  normalizeMemory(source.userText) ===
                  normalizeMemory(previous.text),
              )
              .map((source) => source.id),
          ]),
        ];
        await tx.execute({
          sql: 'INSERT OR IGNORE INTO memory_tombstones VALUES (?, ?, ?)',
          args: [ownerId, fingerprint(previous.text), Date.now()],
        });
        await invalidateSources(tx, turnIds, 'forgotten');
        await tx.execute({
          sql: 'DELETE FROM memory_facts WHERE id = ? AND owner_id = ?',
          args: [id, ownerId],
        });

        if (eraseSources) {
          for (const turnId of turnIds) {
            // Entire source turn is redacted because word-level provenance is unavailable.
            await tx.execute({
              sql: "UPDATE call_turns SET user_text = '', generated_text = '' WHERE id = ?",
              args: [turnId],
            });
            await tx.execute({
              sql: "UPDATE speech_segments SET text = '' WHERE response_id = (SELECT response_id FROM call_turns WHERE id = ?)",
              args: [turnId],
            });
            await tx.execute({
              sql: 'DELETE FROM memory_facts WHERE owner_id = ? AND id IN (SELECT fact_id FROM memory_fact_sources WHERE turn_id = ?)',
              args: [ownerId, turnId],
            });
          }
        }

        await cleanupEntities(tx);
        await bump(tx);

        return {
          originalHistoryRetained: !eraseSources && turnIds.length > 0,
        };
      });
    },
    async summaries(conversationId) {
      const { rows } = await client.execute({
        sql: 'SELECT * FROM memory_summaries WHERE owner_id = ? AND (? IS NULL OR conversation_id = ?) ORDER BY created_at DESC LIMIT 200',
        args: [ownerId, conversationId ?? null, conversationId ?? null],
      });

      return rows.map((r) =>
        SummarySchema.parse({
          id: r.id,
          conversationId: r.conversation_id,
          content: r.content,
          dataClass: r.data_class,
          permission: r.permission,
          version: Number(r.version),
          createdAt: Number(r.created_at),
        }),
      );
    },
    async permitSummary(id, version, permission) {
      return write(async (tx) => {
        const { rows } = await tx.execute({
          sql: 'SELECT * FROM memory_summaries WHERE id = ? AND owner_id = ?',
          args: [id, ownerId],
        });

        if (!rows.length) {
          throw new NotFoundError();
        }

        if (Number(rows[0]!.version) !== version) {
          throw new ProviderBusyError(
            'O resumo mudou; consulte a versão atual.',
          );
        }

        await tx.execute({
          sql: 'UPDATE memory_summaries SET permission = ?, version = version + 1 WHERE id = ? AND owner_id = ?',
          args: [permission, id, ownerId],
        });
        await bump(tx);

        return SummarySchema.parse({
          id,
          conversationId: rows[0]!.conversation_id,
          content: rows[0]!.content,
          dataClass: rows[0]!.data_class,
          permission,
          version: version + 1,
          createdAt: Number(rows[0]!.created_at),
        });
      });
    },
    async enqueue(conversationId) {
      await write(async (tx) => {
        if (conversationId) {
          await requireConversation(tx, conversationId);
        }

        const { rows: sessions } = await tx.execute({
          sql: "SELECT s.* FROM call_sessions s WHERE owner_id = ? AND (? IS NULL OR conversation_id = ?) AND EXISTS (SELECT 1 FROM call_turns t WHERE t.session_id = s.id AND t.status <> 'processing' AND t.user_text <> '' AND NOT EXISTS (SELECT 1 FROM memory_job_sources WHERE turn_id = t.id) AND NOT EXISTS (SELECT 1 FROM memory_blocked_turns WHERE turn_id = t.id AND owner_id = s.owner_id)) ORDER BY started_at LIMIT 200",
          args: [ownerId, conversationId ?? null, conversationId ?? null],
        });
        let queued = 0;

        for (const session of sessions) {
          while (queued < 20) {
            const { rows } = await tx.execute({
              sql: "SELECT id FROM call_turns t WHERE session_id = ? AND status <> 'processing' AND user_text <> '' AND NOT EXISTS (SELECT 1 FROM memory_job_sources WHERE turn_id = t.id) AND NOT EXISTS (SELECT 1 FROM memory_blocked_turns WHERE turn_id = t.id AND owner_id = ?) ORDER BY created_at, rowid LIMIT 8",
              args: [String(session.id), ownerId],
            });

            if (
              !rows.length ||
              (rows.length < 8 && session.ended_at === null)
            ) {
              break;
            }

            const id = randomUUID();
            const key = createHash('sha256')
              .update(rows.map((r) => String(r.id)).join(':'))
              .digest('hex');
            await tx.execute({
              sql: 'INSERT INTO memory_jobs(id, owner_id, conversation_id, session_id, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              args: [
                id,
                ownerId,
                String(session.conversation_id),
                String(session.id),
                key,
                Date.now(),
              ],
            });

            for (const source of rows) {
              await tx.execute({
                sql: 'INSERT INTO memory_job_sources VALUES (?, ?)',
                args: [id, String(source.id)],
              });
            }

            queued++;
          }

          await tx.execute({
            sql: "UPDATE memory_work_pending SET status = 'queued' WHERE session_id = ? AND status = 'pending'",
            args: [String(session.id)],
          });
        }
      });
    },
    async recover() {
      await client.execute({
        sql: "UPDATE memory_jobs SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END, lease_until = NULL, last_error = 'PROCESS_RESTARTED' WHERE owner_id = ? AND status = 'running'",
        args: [ownerId],
      });
    },
    async claim(now) {
      return write(async (tx) => {
        await ensure(tx);
        const { rows } = await tx.execute({
          sql: "SELECT j.*, p.epoch FROM memory_jobs j JOIN memory_policy p ON p.owner_id = j.owner_id WHERE j.owner_id = ? AND (j.status = 'pending' OR (j.status = 'running' AND j.lease_until < ?)) AND j.next_run <= ? AND j.attempts < 5 ORDER BY j.created_at, j.id LIMIT 1",
          args: [ownerId, now, now],
        });

        if (!rows.length) {
          return null;
        }

        const row = rows[0]!;
        await tx.execute({
          sql: "UPDATE memory_jobs SET status = 'running', lease_until = ? WHERE id = ?",
          args: [now + 120000, String(row.id)],
        });
        const selected = await sources(
          tx,
          't.id IN (SELECT turn_id FROM memory_job_sources WHERE job_id = ?) AND NOT EXISTS(SELECT 1 FROM memory_blocked_turns WHERE turn_id = t.id AND owner_id = c.owner_id)',
          [String(row.id)],
        );

        return {
          id: String(row.id),
          conversationId: String(row.conversation_id),
          attempts: Number(row.attempts),
          epoch: Number(row.epoch),
          sources: selected,
        };
      });
    },
    async previousSources(job) {
      if (!job.sources.length) {
        return [];
      }

      const { rows } = await client.execute({
        sql: "SELECT t.id FROM call_turns t JOIN foundation_conversations c ON c.id = t.conversation_id WHERE c.owner_id = ? AND t.conversation_id = ? AND t.rowid < (SELECT rowid FROM call_turns WHERE id = ?) AND t.status <> 'processing' AND t.user_text <> '' AND NOT EXISTS (SELECT 1 FROM memory_blocked_turns WHERE turn_id = t.id AND owner_id = c.owner_id) ORDER BY t.created_at DESC, t.rowid DESC LIMIT 6",
        args: [ownerId, job.conversationId, job.sources[0]!.id],
      });

      return rows.length
        ? sources(
            client,
            `t.id IN (${rows.map(() => '?').join(',')})`,
            rows.map((r) => String(r.id)),
          )
        : [];
    },
    async complete(job, suggestions, summary, origin) {
      return write(async (tx) => {
        const epoch = await tx.execute({
          sql: 'SELECT epoch FROM memory_policy WHERE owner_id = ?',
          args: [ownerId],
        });
        const current = await tx.execute({
          sql: "SELECT 1 FROM memory_jobs WHERE id = ? AND owner_id = ? AND status = 'running'",
          args: [job.id, ownerId],
        });

        if (!current.rows.length) {
          return false;
        }

        if (Number(epoch.rows[0]?.epoch) !== job.epoch) {
          await tx.execute({
            sql: "UPDATE memory_jobs SET status = 'pending', lease_until = NULL WHERE id = ?",
            args: [job.id],
          });

          return false;
        }

        const { autoApprove } = await policy(tx);

        for (const suggestion of suggestions) {
          const selected = suggestion.evidence.map((e) => e);
          const evidenceSources = await sources(
            tx,
            `t.id IN (${selected.map(() => '?').join(',')}) AND t.conversation_id = ? AND NOT EXISTS(SELECT 1 FROM memory_blocked_turns WHERE turn_id = t.id AND owner_id = c.owner_id)`,
            [...selected.map((e) => e.turnId), job.conversationId],
          );

          if (
            !selected.length ||
            !selected.some((e) => job.sources.some((s) => s.id === e.turnId)) ||
            selected.some(
              (e) =>
                !evidenceSources.some(
                  (s) => s.id === e.turnId && s.userText.includes(e.quote),
                ),
            )
          ) {
            throw new ProviderBusyError(
              'Uma sugestão não corresponde às fontes do trabalho.',
            );
          }

          const dataClass = strongestDataClass(
            evidenceSources.map((s) => s.dataClass),
          );
          const kind = suggestion.kind ?? 'fact';
          const expiresAt =
            kind === 'event'
              ? Math.max(
                  ...evidenceSources.map((s) => s.createdAt ?? Date.now()),
                ) +
                (suggestion.validForDays ?? 7) * 86400000
              : null;

          if (expiresAt !== null && expiresAt <= Date.now()) {
            continue;
          }

          if (suggestion.supersedes) {
            const target = await fact(
              tx,
              suggestion.supersedes.factId,
              suggestion.supersedes.version,
            );

            if (
              kind !== 'correction' ||
              target.status !== 'confirmed' ||
              (dataClass !== 'local-only' &&
                (target.permission !== 'eligible' ||
                  target.dataClass === 'local-only' ||
                  (dataClass === 'synthetic' &&
                    target.dataClass !== 'synthetic')))
            ) {
              throw new ProviderBusyError('O alvo da correção não é elegível.');
            }
          }

          const id = await insertFact(
            tx,
            {
              text: suggestion.text,
              category: suggestion.category,
              relation: suggestion.relation,
              dataClass,
              permission: 'local-only',
              kind,
              expiresAt,
              supersedes: suggestion.supersedes ?? null,
            },
            'suggested',
            origin,
          );

          if (id) {
            const previous = await fact(tx, id);
            const storedDataClass = strongestDataClass([
              previous.dataClass,
              dataClass,
            ]);
            await tx.execute({
              sql: 'UPDATE memory_facts SET data_class = ? WHERE id = ?',
              args: [storedDataClass, id],
            });

            for (const evidence of suggestion.evidence) {
              await tx.execute({
                sql: 'INSERT OR IGNORE INTO memory_fact_sources VALUES (?, ?, ?)',
                args: [id, evidence.turnId, evidence.quote],
              });
            }

            if (
              autoApprove &&
              previous.status === 'suggested' &&
              previous.origin !== 'user'
            ) {
              await applyCorrection(
                tx,
                id,
                { ...previous, dataClass: storedDataClass },
                true,
              );
              await tx.execute({
                sql: "UPDATE memory_facts SET status = 'confirmed', permission = ?, version = version + 1, updated_at = ? WHERE id = ?",
                args: [
                  storedDataClass === 'local-only' ? 'local-only' : 'eligible',
                  Date.now(),
                  id,
                ],
              });
            }
          }
        }

        if (summary && job.sources.length) {
          await tx.execute({
            sql: 'INSERT OR REPLACE INTO memory_summaries(id, owner_id, conversation_id, job_id, content, data_class, permission, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [
              randomUUID(),
              ownerId,
              job.conversationId,
              job.id,
              summary,
              strongestDataClass(job.sources.map((s) => s.dataClass)),
              autoApprove &&
              job.sources.every((s) => s.dataClass !== 'local-only')
                ? 'eligible'
                : 'local-only',
              Date.now(),
            ],
          });
        }

        await tx.execute({
          sql: "UPDATE memory_jobs SET status = 'completed', lease_until = NULL, last_error = NULL WHERE id = ?",
          args: [job.id],
        });

        return true;
      });
    },
    async defer(job, code, nextRun, countAttempt) {
      await client.execute({
        sql: "UPDATE memory_jobs SET attempts = attempts + ?, status = CASE WHEN attempts + ? >= 5 THEN 'failed' ELSE 'pending' END, next_run = ?, last_error = ?, lease_until = NULL WHERE id = ? AND owner_id = ? AND status = 'running'",
        args: [
          Number(countAttempt),
          Number(countAttempt),
          nextRun,
          code,
          job.id,
          ownerId,
        ],
      });
    },
    async jobs() {
      const { rows } = await client.execute({
        sql: 'SELECT * FROM memory_jobs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200',
        args: [ownerId],
      });

      return rows.map((r) => ({
        id: String(r.id),
        conversationId: String(r.conversation_id),
        status: String(r.status),
        attempts: Number(r.attempts),
        nextRun: Number(r.next_run),
        lastError: r.last_error === null ? null : String(r.last_error),
      }));
    },
    async listConversations() {
      const { rows } = await client.execute({
        sql: 'SELECT id, created_at FROM foundation_conversations WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200',
        args: [ownerId],
      });

      return rows.map((r) => ({
        id: String(r.id),
        createdAt: Number(r.created_at),
      }));
    },
    async conversation(id) {
      await requireConversation(client, id);

      return {
        id,
        turns: await sources(client, 't.conversation_id = ?', [id]),
      };
    },
    async deleteConversation(id) {
      await write((tx) => deleteConversation(tx, id));
    },
    async rebuild(conversationId) {
      await write(async (tx) => {
        await requireConversation(tx, conversationId);
        await tx.execute({
          sql: 'DELETE FROM memory_summaries WHERE conversation_id = ? AND owner_id = ?',
          args: [conversationId, ownerId],
        });
        await tx.execute({
          sql: "DELETE FROM memory_facts WHERE owner_id = ? AND status = 'suggested' AND id IN (SELECT fact_id FROM memory_fact_sources s JOIN call_turns t ON t.id = s.turn_id WHERE t.conversation_id = ?)",
          args: [ownerId, conversationId],
        });
        await tx.execute({
          sql: 'DELETE FROM memory_jobs WHERE conversation_id = ? AND owner_id = ?',
          args: [conversationId, ownerId],
        });
        await cleanupEntities(tx);
        await bump(tx);
      });
      await repository.enqueue(conversationId);
    },
    async purgeExpired(now) {
      const settings = await policy();

      const cutoff =
        settings.retentionDays === null
          ? null
          : now - settings.retentionDays * 86400000;
      await write(async (tx) => {
        const { rows } = await tx.execute({
          sql: 'SELECT c.id FROM foundation_conversations c WHERE owner_id = ? AND COALESCE((SELECT MAX(COALESCE(ended_at, ?)) FROM call_sessions WHERE conversation_id = c.id), c.created_at) < ? LIMIT 20',
          args: [ownerId, now, cutoff],
        });

        for (const row of rows) {
          await deleteConversation(tx, String(row.id));
        }

        const expired = await tx.execute({
          sql: 'SELECT id, text, fingerprint FROM memory_facts WHERE owner_id = ? AND ((expires_at IS NOT NULL AND expires_at <= ?) OR (? IS NOT NULL AND updated_at < ?)) LIMIT 200',
          args: [ownerId, now, cutoff, cutoff],
        });
        const originalSources = expired.rows.length
          ? await sources(tx, 't.user_text <> ?', [''])
          : [];

        for (const old of expired.rows) {
          const sourceIds = await tx.execute({
            sql: 'SELECT turn_id FROM memory_fact_sources WHERE fact_id = ?',
            args: [String(old.id)],
          });
          const affected = [
            ...new Set([
              ...sourceIds.rows.map((s) => String(s.turn_id)),
              ...originalSources
                .filter(
                  (s) =>
                    normalizeMemory(s.userText) ===
                    normalizeMemory(String(old.text)),
                )
                .map((s) => s.id),
            ]),
          ];
          await tx.execute({
            sql: 'INSERT OR IGNORE INTO memory_tombstones VALUES (?, ?, ?)',
            args: [ownerId, String(old.fingerprint), now],
          });
          await invalidateSources(tx, affected, 'expired');
          await tx.execute({
            sql: 'DELETE FROM memory_facts WHERE id = ? AND owner_id = ?',
            args: [String(old.id), ownerId],
          });
        }

        if (expired.rows.length) {
          await bump(tx);
        }

        await cleanupEntities(tx);
      });
    },
    async exportData() {
      // Each owner-bound query runs in the same transaction for a consistent export.
      return write(async (tx) => {
        const tables = [
          'memory_policy',
          'memory_facts',
          'memory_entities',
          'memory_summaries',
          'memory_jobs',
          'memory_tombstones',
          'memory_blocked_turns',
          'foundation_conversations',
          'call_sessions',
        ];
        const result: Record<string, unknown> = {
          schemaVersion: 1,
          exportedAt: Date.now(),
        };

        for (const table of tables) {
          result[table] = (
            await tx.execute({
              sql: `SELECT * FROM ${table} WHERE owner_id = ?`,
              args: [ownerId],
            })
          ).rows;
        }

        result.turns = (
          await tx.execute({
            sql: 'SELECT t.* FROM call_turns t JOIN foundation_conversations c ON c.id = t.conversation_id WHERE c.owner_id = ?',
            args: [ownerId],
          })
        ).rows;
        result.segments = (
          await tx.execute({
            sql: 'SELECT s.* FROM speech_segments s JOIN call_turns t ON t.response_id = s.response_id JOIN foundation_conversations c ON c.id = t.conversation_id WHERE c.owner_id = ?',
            args: [ownerId],
          })
        ).rows;
        result.sources = (
          await tx.execute({
            sql: 'SELECT s.* FROM memory_fact_sources s JOIN memory_facts f ON f.id = s.fact_id WHERE f.owner_id = ?',
            args: [ownerId],
          })
        ).rows;
        result.relations = (
          await tx.execute({
            sql: 'SELECT r.* FROM memory_relations r JOIN memory_facts f ON f.id = r.fact_id WHERE f.owner_id = ?',
            args: [ownerId],
          })
        ).rows;
        result.jobSources = (
          await tx.execute({
            sql: 'SELECT s.* FROM memory_job_sources s JOIN memory_jobs j ON j.id = s.job_id WHERE j.owner_id = ?',
            args: [ownerId],
          })
        ).rows;
        result.resumptions = (
          await tx.execute({
            sql: 'SELECT r.* FROM memory_resumptions r JOIN call_sessions s ON s.id = r.session_id WHERE s.owner_id = ?',
            args: [ownerId],
          })
        ).rows;

        return result;
      });
    },
  };

  return repository;
}
