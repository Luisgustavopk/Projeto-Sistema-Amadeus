import type { Client } from '@libsql/client';
import { normalizeMemory } from '../../domain/memory/model.ts';

// SQL migration adds the column; JavaScript preserves the search normalization
// (including accents) used when creating facts. Safe to resume after a restart.
export async function backfillMemorySearch(client: Client) {
  while (true) {
    const { rows } = await client.execute(
      "SELECT f.id, f.text, f.category, s.label AS subject, r.predicate, o.label AS object FROM memory_facts f LEFT JOIN memory_relations r ON r.fact_id = f.id LEFT JOIN memory_entities s ON s.id = r.subject_id LEFT JOIN memory_entities o ON o.id = r.object_id WHERE f.search_text = '' LIMIT 200",
    );

    if (!rows.length) {
      return;
    }

    await client.batch(
      rows.map((row) => ({
        sql: "UPDATE memory_facts SET search_text = ? WHERE id = ? AND search_text = ''",
        args: [
          normalizeMemory(
            String(row.text) +
              ' ' +
              String(row.category) +
              ' ' +
              JSON.stringify(
                row.predicate
                  ? {
                      subject: row.subject,
                      predicate: row.predicate,
                      object: row.object,
                    }
                  : null,
              ),
          ),
          String(row.id),
        ],
      })),
      'write',
    );
  }
}
