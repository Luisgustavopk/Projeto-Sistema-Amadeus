import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import {
  FactInputSchema,
  canonicalMemoryRelation,
  memoryEquivalenceKey,
  normalizeMemory,
} from '../../domain/memory/model.ts';

// NULL marks old/unprocessed rows; empty string marks no proven equivalence.
// This migration canonicalizes aliases but never approves or merges facts.
export async function backfillMemoryEquivalence(client: Client) {
  while (true) {
    const tx = await client.transaction('write');

    try {
      const { rows } = await tx.execute(
        'SELECT f.*, s.label AS subject, r.predicate, o.label AS object FROM memory_facts f LEFT JOIN memory_relations r ON r.fact_id = f.id LEFT JOIN memory_entities s ON s.id = r.subject_id LEFT JOIN memory_entities o ON o.id = r.object_id WHERE f.equivalence_key IS NULL LIMIT 200',
      );

      if (!rows.length) {
        await tx.commit();

        return;
      }

      for (const row of rows) {
        const input = FactInputSchema.parse({
          text: row.text,
          category: row.category,
          dataClass: row.data_class,
          permission: row.permission,
          kind: row.kind,
          expiresAt: row.expires_at,
          supersedes: row.supersedes_id
            ? { factId: row.supersedes_id, version: row.supersedes_version }
            : null,
          relation: row.predicate
            ? {
                subject: row.subject,
                predicate: row.predicate,
                object: row.object,
              }
            : null,
        });
        input.relation = canonicalMemoryRelation(input.relation);

        if (input.relation?.subject === 'usuário') {
          await tx.execute({
            sql: 'INSERT OR IGNORE INTO memory_entities VALUES (?, ?, ?, ?)',
            args: [randomUUID(), row.owner_id!, 'usuário', 'usuario'],
          });
          await tx.execute({
            sql: "UPDATE memory_entities SET label = 'usuário' WHERE owner_id = ? AND normalized = 'usuario'",
            args: [row.owner_id!],
          });
          await tx.execute({
            sql: "UPDATE memory_relations SET subject_id = (SELECT id FROM memory_entities WHERE owner_id = ? AND normalized = 'usuario') WHERE fact_id = ?",
            args: [row.owner_id!, row.id!],
          });
        }

        await tx.execute({
          sql: 'UPDATE memory_facts SET equivalence_key = ?, search_text = ? WHERE id = ?',
          args: [
            memoryEquivalenceKey(input),
            normalizeMemory(
              input.text +
                ' ' +
                input.category +
                ' ' +
                JSON.stringify(input.relation),
            ),
            row.id!,
          ],
        });
      }

      await tx.execute(
        'DELETE FROM memory_entities WHERE id NOT IN (SELECT subject_id FROM memory_relations UNION SELECT object_id FROM memory_relations)',
      );
      await tx.commit();
    } catch (error) {
      await tx.rollback();

      throw error;
    } finally {
      tx.close();
    }
  }
}
