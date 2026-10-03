import type { Client } from '@libsql/client';

export async function recoverInterruptedCalls(client: Client) {
  await client.batch(
    [
      {
        sql: "UPDATE call_sessions SET state = 'disconnected', ended_at = ? WHERE ended_at IS NULL",
        args: [Date.now()],
      },
      "UPDATE call_turns SET status = 'interrupted', completed_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE status = 'processing'",
      "INSERT OR IGNORE INTO memory_work_pending SELECT lower(hex(randomblob(16))), conversation_id, id, 'pending', ended_at FROM call_sessions WHERE ended_at IS NOT NULL",
    ],
    'write',
  );
}
