import type { Client } from '@libsql/client';
import type { PersonaReferenceRepository } from '../../ports/persona-references.ts';
import {
  PersonaReferenceSchema,
  referenceHash,
} from '../../domain/persona/reference.ts';
import { validEmbedding } from '../../domain/memory/embeddings.ts';

export function createPersonaReferenceRepository(
  client: Client,
): PersonaReferenceRepository {
  return {
    async synchronize(entries) {
      const parsed = entries.map((entry) =>
        PersonaReferenceSchema.parse(entry),
      );

      if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) {
        throw new Error('Referências duplicadas.');
      }

      const tx = await client.transaction('write');

      try {
        for (const entry of parsed) {
          const payload = JSON.stringify(entry);
          const hash = referenceHash(payload);
          await tx.execute({
            sql: 'INSERT INTO persona_reference_documents(id, kind, reviewed, payload, content_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, reviewed=excluded.reviewed, payload=excluded.payload, content_hash=excluded.content_hash',
            args: [entry.id, entry.kind, Number(entry.reviewed), payload, hash],
          });
          await tx.execute({
            sql: 'DELETE FROM persona_reference_embeddings WHERE reference_id = ? AND content_hash <> ?',
            args: [entry.id, hash],
          });
        }

        const ids = parsed.map((entry) => entry.id);
        await tx.execute({
          sql: `DELETE FROM persona_reference_documents${ids.length ? ` WHERE id NOT IN (${ids.map(() => '?').join(',')})` : ''}`,
          args: ids,
        });
        await tx.commit();
      } catch (error) {
        await tx.rollback();

        throw error;
      } finally {
        tx.close();
      }
    },
    async documents() {
      const { rows } = await client.execute(
        'SELECT payload FROM persona_reference_documents ORDER BY id',
      );

      return rows.map((row) =>
        PersonaReferenceSchema.parse(JSON.parse(String(row.payload))),
      );
    },
    async vectors(model) {
      const { rows } = await client.execute({
        sql: "SELECT d.id, e.vector FROM persona_reference_documents d JOIN persona_reference_embeddings e ON e.reference_id = d.id AND e.content_hash = d.content_hash WHERE e.model_key = ? AND d.reviewed = 1 AND d.kind <> 'lore-source'",
        args: [model],
      });

      return new Map(
        rows.flatMap((row) => {
          const vector: unknown = JSON.parse(String(row.vector));

          return validEmbedding(vector)
            ? [[String(row.id), vector] as const]
            : [];
        }),
      );
    },
    async saveVector(id, hash, model, vector) {
      if (!validEmbedding(vector)) {
        throw new Error('Vetor de referência inválido.');
      }

      await client.execute({
        sql: "INSERT INTO persona_reference_embeddings(reference_id, model_key, content_hash, vector) SELECT id, ?, content_hash, ? FROM persona_reference_documents WHERE id = ? AND content_hash = ? AND reviewed = 1 AND kind <> 'lore-source' ON CONFLICT(reference_id, model_key) DO UPDATE SET content_hash=excluded.content_hash, vector=excluded.vector",
        args: [model, JSON.stringify(vector), id, hash],
      });
    },
  };
}
