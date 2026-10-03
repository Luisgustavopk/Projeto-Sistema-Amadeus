import { z } from 'zod';
import {
  DataClassSchema,
  RoleSchema,
  type Role,
} from '../../domain/providers/model.ts';
import { InvalidProviderInputError } from '../../domain/errors/providers.ts';
import { assertProviderCanExecute } from '../../domain/providers/data-policy.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type {
  ProviderFactory,
  ProviderInput,
  ProviderOutput,
} from '../../ports/provider.ts';
import type { ExecutionGate } from '../../ports/activity-gate.ts';

const InputSchema = z.strictObject({
  content: z.string().min(1).max(65536),
  dataClass: DataClassSchema,
  maxTokens: z.number().int().min(1).max(1000000),
});

export function createProviderExecution(
  configuration: ProviderConfigurationRepository,
  usage: ProviderUsageRepository,
  ownerId: string,
  factory: ProviderFactory,
  gate: ExecutionGate,
) {
  return {
    async execute(role: Role, input: ProviderInput, signal?: AbortSignal) {
      if (
        !InputSchema.safeParse(input).success ||
        !RoleSchema.safeParse(role).success
      ) {
        throw new InvalidProviderInputError();
      }

      const release = gate.beginExecution();

      try {
        const config = (await configuration.get(ownerId))[role];
        assertProviderCanExecute(config, input.dataClass);

        const reservation = await usage.reserve(
          ownerId,
          role,
          config,
          Buffer.byteLength(input.content, 'utf8') + input.maxTokens,
        );
        let result: ProviderOutput;

        try {
          result = await factory(role, config).execute(input, signal);
        } catch (error) {
          await usage.settle(reservation, null);

          throw error;
        }

        // Persistence failure must not reclassify a successful provider call as failed.
        await usage.settle(reservation, result);

        return result;
      } finally {
        release();
      }
    },
  };
}
