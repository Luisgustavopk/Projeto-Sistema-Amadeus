import type { Client } from '@libsql/client';
import type { CallTicketRepository } from '../../ports/call-ticket-repository.ts';
import { hash } from './keys.ts';

export class SqliteCallTicketRepository implements CallTicketRepository {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async create(args: {
    ticket: string;
    conversation: string;
    owner: string;
    credential: string;
    origin: string;
    expiresAt: number;
  }) {
    await this.client.batch(
      [
        {
          sql: 'DELETE FROM foundation_tickets WHERE expires_at <= ?',
          args: [Date.now()],
        },
        {
          sql: 'INSERT INTO foundation_tickets VALUES (?, ?, ?, ?, ?, ?, NULL)',
          args: [
            hash(args.ticket),
            args.conversation,
            args.owner,
            hash(args.credential),
            args.origin,
            args.expiresAt,
          ],
        },
      ],
      'write',
    );
  }

  async consume(args: {
    ticket: string;
    conversation: string;
    owner: string;
    credential: string;
    origin: string;
    now?: number;
  }) {
    const now = args.now ?? Date.now();
    const result = await this.client.execute({
      sql: 'UPDATE foundation_tickets SET consumed_at = ? WHERE hash = ? AND conversation_id = ? AND owner_id = ? AND credential_hash = ? AND origin = ? AND consumed_at IS NULL AND expires_at > ? RETURNING hash',
      args: [
        now,
        hash(args.ticket),
        args.conversation,
        args.owner,
        hash(args.credential),
        args.origin,
        now,
      ],
    });

    return result.rows.length === 1;
  }
}
