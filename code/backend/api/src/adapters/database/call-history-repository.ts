import type { Client } from '@libsql/client';
import type {
  CallHistoryRepository,
  StoredTurn,
} from '../../ports/call-history-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import type { TurnStatus } from '../../domain/voice/model.ts';
import { randomUUID } from 'node:crypto';

export function createSqliteCallHistory(client: Client): CallHistoryRepository {
  return {
    async startSession(input) {
      await client.execute({
        sql: "INSERT INTO call_sessions VALUES (?, ?, ?, ?, ?, NULL, 'connected')",
        args: [
          input.id,
          input.conversationId,
          input.ownerId,
          input.voiceProfileId,
          Date.now(),
        ],
      });
    },
    async endSession(sessionId, state) {
      await client.batch(
        [
          {
            sql: 'UPDATE call_sessions SET state = ?, ended_at = ? WHERE id = ? AND ended_at IS NULL',
            args: [state, Date.now(), sessionId],
          },
          {
            sql: "INSERT OR IGNORE INTO memory_work_pending VALUES (?, (SELECT conversation_id FROM call_sessions WHERE id = ?), ?, 'pending', ?)",
            args: [randomUUID(), sessionId, sessionId, Date.now()],
          },
        ],
        'write',
      );
    },
    async beginTurn(input) {
      await client.execute({
        sql: "INSERT INTO call_turns VALUES (?, ?, ?, ?, ?, ?, '', '', 'processing', ?, NULL)",
        args: [
          input.id,
          input.sessionId,
          input.conversationId,
          input.clientTurnId,
          input.responseId,
          input.dataClass,
          Date.now(),
        ],
      });
    },
    async updateTurn(responseId, values) {
      await client.execute({
        sql: 'UPDATE call_turns SET user_text = COALESCE(?, user_text), generated_text = COALESCE(?, generated_text), status = COALESCE(?, status), completed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE completed_at END WHERE response_id = ?',
        args: [
          values.userText ?? null,
          values.generatedText ?? null,
          values.status ?? null,
          values.status ?? null,
          Date.now(),
          responseId,
        ],
      });
    },
    async recent(conversationId, ownerId, limit): Promise<StoredTurn[]> {
      const { rows } = await client.execute({
        sql: "SELECT t.user_text, COALESCE((SELECT GROUP_CONCAT(text, ' ') FROM (SELECT text FROM speech_segments WHERE response_id = t.response_id AND sample_count > 0 AND played_samples = sample_count ORDER BY position)), '') AS generated_text, t.data_class, t.status, EXISTS(SELECT 1 FROM speech_segments WHERE response_id = t.response_id AND played_samples > 0 AND played_samples < sample_count) AS partially_played FROM call_turns t JOIN foundation_conversations c ON c.id = t.conversation_id WHERE c.id = ? AND c.owner_id = ? AND t.user_text <> '' AND t.status IN ('completed', 'interrupted', 'failed') ORDER BY t.created_at DESC, t.rowid DESC LIMIT ?",
        args: [conversationId, ownerId, limit],
      });

      return rows.reverse().map((row) => ({
        userText: String(row.user_text),
        generatedText: String(row.generated_text),
        dataClass: String(row.data_class) as DataClass,
        responseStatus: String(row.status) as TurnStatus,
        partiallyPlayed: Boolean(row.partially_played),
      }));
    },
    async addSegment(segment) {
      await client.execute({
        sql: "INSERT INTO speech_segments VALUES (?, ?, ?, ?, 0, 0, 'generated')",
        args: [segment.id, segment.responseId, segment.position, segment.text],
      });
    },
    async setAudio(segmentId, sampleCount) {
      await client.execute({
        sql: "UPDATE speech_segments SET sample_count = ?, status = 'sent' WHERE id = ?",
        args: [sampleCount, segmentId],
      });
    },
    async acknowledge(input) {
      const result = await client.execute({
        sql: "UPDATE speech_segments SET played_samples = ?, status = CASE WHEN ? = sample_count THEN 'played' ELSE 'partial' END WHERE id = ? AND response_id = ? AND played_samples <= ? AND sample_count >= ? AND EXISTS (SELECT 1 FROM call_turns WHERE response_id = ? AND session_id = ?)",
        args: [
          input.playedSamples,
          input.playedSamples,
          input.segmentId,
          input.responseId,
          input.playedSamples,
          input.playedSamples,
          input.responseId,
          input.sessionId,
        ],
      });

      return result.rowsAffected === 1;
    },
  };
}
