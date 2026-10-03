import { expect, it, vi } from 'vitest';
import { createProviderExecution } from '../../src/application/providers/execution.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import {
  DEFAULT_PROVIDERS,
  ProvidersSchema,
} from '../../src/domain/providers/model.ts';
import type { ProviderUsageRepository } from '../../src/ports/provider-usage-repository.ts';

it('não sobrescreve sucesso com falha quando a gravação do consumo falha', async () => {
  const output = { content: 'response', inputTokens: 3, outputTokens: 2 };
  const gate = new ActivityGate(1);
  const settle = vi
    .fn<ProviderUsageRepository['settle']>()
    .mockRejectedValue(new Error('settlement unavailable'));
  const config = ProvidersSchema.parse({
    ...DEFAULT_PROVIDERS,
    llm: { adapter: 'http-json', endpoint: 'http://localhost:9999' },
  });
  const execution = createProviderExecution(
    { get: async () => config, save: async () => {} },
    {
      usage: async () => {
        throw new Error('unused');
      },
      reserve: async () => 'reservation',
      settle,
    },
    'primary',
    (role) => ({
      role,
      transport: 'buffered-json',
      nativeStreaming: false,
      health: async () => {
        throw new Error('unused');
      },
      execute: async () => output,
    }),
    gate,
  );

  await expect(
    execution.execute('llm', {
      content: 'synthetic',
      dataClass: 'synthetic',
      maxTokens: 10,
    }),
  ).rejects.toThrow('settlement unavailable');
  expect(settle).toHaveBeenCalledExactlyOnceWith('reservation', output);
  const release = gate.beginConfiguration();
  release();
});
