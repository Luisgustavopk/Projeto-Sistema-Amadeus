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

it('contabiliza instruções da persona e recusa seu envio a serviços de fala', async () => {
  const { estimateProviderBudget, validateProviderInput } =
    await import('../../src/application/providers/input.ts');
  const input = {
    content: 'Olá',
    systemPrompt: 'Persona',
    dataClass: 'synthetic' as const,
    maxTokens: 10,
  };
  expect(estimateProviderBudget(input)).toBe(
    Buffer.byteLength('OláPersona', 'utf8') + 10,
  );
  expect(() => validateProviderInput('llm', input)).not.toThrow();
  expect(() => validateProviderInput('tts', input)).toThrow();
});

it('preserva capacidade para conversa e não usa Gemini pago em trabalhos de memória', async () => {
  const usage = {
    usage: vi.fn<ProviderUsageRepository['usage']>().mockResolvedValue({
      day: '2026-10-05',
      requests: 80,
      budgetTokens: 0,
      reportedInputTokens: 0,
      reportedOutputTokens: 0,
      estimatedRequests: 0,
      limits: {
        requestsPerDay: 100,
        tokensPerDay: 100000,
        source: 'operator',
      },
    }),
    reserve: vi
      .fn<ProviderUsageRepository['reserve']>()
      .mockResolvedValue('reservation'),
    settle: vi.fn<ProviderUsageRepository['settle']>().mockResolvedValue(),
  };
  const execute = vi.fn().mockResolvedValue({
    content: 'Resposta',
    inputTokens: 1,
    outputTokens: 1,
  });
  let config = ProvidersSchema.parse({
    ...DEFAULT_PROVIDERS,
    llm: {
      adapter: 'http-json',
      endpoint: 'http://127.0.0.1:9999',
      limits: { requestsPerDay: 100, tokensPerDay: 100000 },
    },
  });
  const services = createProviderExecution(
    { get: async () => config, save: async () => {} },
    usage,
    'primary',
    (role) => ({
      role,
      transport: 'buffered-json',
      nativeStreaming: false,
      health: async () => {
        throw Error('Unused');
      },
      execute,
    }),
    new ActivityGate(1),
  );
  const input = {
    content: 'Dados artificiais.',
    dataClass: 'synthetic' as const,
    maxTokens: 32,
  };
  await expect(
    services.execute('llm', { ...input, purpose: 'memory' }),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(usage.reserve).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
  await services.execute('llm', input);
  expect(execute).toHaveBeenCalledTimes(1);
  config = ProvidersSchema.parse({
    ...DEFAULT_PROVIDERS,
    llm: {
      adapter: 'gemini',
      model: 'test',
      apiKeyEnv: 'GEMINI_API_KEY',
      geminiTier: 'paid',
      limits: { requestsPerDay: 100, tokensPerDay: 100000 },
    },
  });
  await expect(
    services.execute('llm', { ...input, purpose: 'memory' }),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(execute).toHaveBeenCalledTimes(1);
});
