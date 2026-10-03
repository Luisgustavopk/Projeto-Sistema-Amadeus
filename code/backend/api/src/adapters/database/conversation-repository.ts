import type { Client } from '@libsql/client';
import type { ConversationRepository } from '../../ports/conversation-repository.ts';
import { randomUUID } from 'node:crypto';

export class SqliteConversationRepository implements ConversationRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async create(owner: string) {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.client.execute({
      sql: 'INSERT INTO foundation_conversations VALUES (?, ?, ?)',
      args: [id, owner, createdAt],
    });

    return { id, createdAt: new Date(createdAt).toISOString() };
  }

  async belongsTo(id: string, owner: string) {
    const result = await this.client.execute({
      sql: 'SELECT id FROM foundation_conversations WHERE id = ? AND owner_id = ?',
      args: [id, owner],
    });

    return result.rows.length > 0;
  }
}
