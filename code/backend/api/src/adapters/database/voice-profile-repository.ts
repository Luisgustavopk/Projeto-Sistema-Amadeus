import type { Client } from '@libsql/client';
import type { VoiceProfile } from '../../domain/voice/model.ts';
import type { VoiceProfileRepository } from '../../ports/voice-profile-repository.ts';

export class SqliteVoiceProfileRepository implements VoiceProfileRepository {
  private readonly client: Client;
  constructor(client: Client) {
    this.client = client;
  }

  async active(ownerId: string): Promise<VoiceProfile | null> {
    const { rows } = await this.client.execute({
      sql: 'SELECT * FROM voice_profiles WHERE owner_id = ? AND active = 1',
      args: [ownerId],
    });
    const row = rows[0];

    return row
      ? {
          id: String(row.id),
          name: String(row.name),
          referenceFile: String(row.reference_file),
          referenceSha256: String(row.reference_sha256),
          createdAt: new Date(Number(row.created_at)).toISOString(),
        }
      : null;
  }

  async activate(ownerId: string, profile: VoiceProfile) {
    await this.client.batch(
      [
        {
          sql: 'UPDATE voice_profiles SET active = 0 WHERE owner_id = ?',
          args: [ownerId],
        },
        {
          sql: 'INSERT INTO voice_profiles VALUES (?, ?, ?, ?, ?, ?, 1)',
          args: [
            profile.id,
            ownerId,
            profile.name,
            profile.referenceFile,
            profile.referenceSha256,
            Date.parse(profile.createdAt),
          ],
        },
      ],
      'write',
    );
  }
}
