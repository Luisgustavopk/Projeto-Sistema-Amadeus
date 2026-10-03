import type { Client } from '@libsql/client';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import { randomUUID } from 'node:crypto';
import type { Role, ProviderConfig } from '../../domain/providers/model.ts';
import { providerKey } from './keys.ts';
import { assertBudgetAvailable } from '../../domain/providers/usage-policy.ts';

export class SqliteProviderUsageRepository implements ProviderUsageRepository {
  private readonly client: Client;
  private reservationQueue: Promise<void> = Promise.resolve();

  constructor(client: Client) {
    this.client = client;
  }

  async usage(
    owner: string,
    role: Role,
    config: ProviderConfig,
    day = new Date().toISOString().slice(0, 10),
  ) {
    const result = await this.client.execute({
      sql: 'SELECT COUNT(*) AS requests, COALESCE(SUM(MAX(reserved_tokens, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))), 0) AS budget_tokens, COALESCE(SUM(input_tokens), 0) AS reported_input, COALESCE(SUM(output_tokens), 0) AS reported_output, SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS estimated_requests FROM foundation_usage WHERE owner_id = ? AND role = ? AND provider_key = ? AND day = ?',
      args: [owner, role, providerKey(role, config), day],
    });
    const row = result.rows[0]!;

    return {
      day,
      requests: Number(row.requests),
      budgetTokens: Number(row.budget_tokens),
      reportedInputTokens: Number(row.reported_input),
      reportedOutputTokens: Number(row.reported_output),
      estimatedRequests: Number(row.estimated_requests ?? 0),
      limits: config.limits,
    };
  }

  async reserve(
    owner: string,
    role: Role,
    config: ProviderConfig,
    tokens: number,
  ) {
    const previous = this.reservationQueue;

    let release: () => void = () => {};

    this.reservationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await this.reserveTransaction(owner, role, config, tokens);
    } finally {
      release();
    }
  }

  private async reserveTransaction(
    owner: string,
    role: Role,
    config: ProviderConfig,
    tokens: number,
  ) {
    const day = new Date().toISOString().slice(0, 10);
    const key = providerKey(role, config);
    const id = randomUUID();
    const tx = await this.client.transaction('write');

    try {
      const result = await tx.execute({
        sql: 'SELECT COUNT(*) AS requests, COALESCE(SUM(MAX(reserved_tokens, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))), 0) AS tokens FROM foundation_usage WHERE owner_id = ? AND role = ? AND provider_key = ? AND day = ?',
        args: [owner, role, key, day],
      });
      const row = result.rows[0]!;

      assertBudgetAvailable(
        config.limits,
        { requests: Number(row.requests), tokens: Number(row.tokens) },
        tokens,
      );

      await tx.execute({
        sql: 'INSERT INTO foundation_usage VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
        args: [id, owner, role, key, day, tokens, 'pending'],
      });
      await tx.commit();

      return id;
    } catch (error) {
      await tx.rollback();

      throw error;
    } finally {
      tx.close();
    }
  }

  async settle(
    id: string,
    outcome: { inputTokens: number | null; outputTokens: number | null } | null,
  ) {
    await this.client.execute({
      sql: "UPDATE foundation_usage SET state = ?, input_tokens = ?, output_tokens = ? WHERE id = ? AND state = 'pending'",
      args: [
        outcome ? 'completed' : 'failed',
        outcome?.inputTokens ?? null,
        outcome?.outputTokens ?? null,
        id,
      ],
    });
  }
}
