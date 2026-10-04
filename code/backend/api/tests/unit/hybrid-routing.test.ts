import { expect, it } from 'vitest';
import {
  ProviderSchema,
  DEFAULT_PROVIDERS,
} from '../../src/domain/providers/model.ts';
import { selectProviderAttempts } from '../../src/application/providers/routing.ts';
import { createProviderStreaming } from '../../src/application/providers/streaming.ts';
import { createProviderExecution } from '../../src/application/providers/execution.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import { ProviderTemporarilyUnavailableError } from '../../src/domain/errors/providers.ts';
import type {
  ProviderFactory,
  ProviderInput,
} from '../../src/ports/provider.ts';

const cloud = ProviderSchema.parse({
  adapter: 'groq',
  model: 'cloud-test',
  apiKeyEnv: 'GROQ_API_KEY',
  dataPolicy: 'personal-approved',
  policyReviewedAt: '2026-10-04T00:00:00.000Z',
  policyReference: 'https://example.com/policy',
  limits: { requestsPerDay: 100, tokensPerDay: 100000 },
  localProvider: {
    adapter: 'openai-local',
    endpoint: 'http://127.0.0.1:8003/v1/chat/completions',
    model: 'local-test',
    dataPolicy: 'local-approved',
  },
});
const input = (content: string): ProviderInput => ({
  content,
  dataClass: 'personal',
  maxTokens: 64,
});

it.each([
  'Oi, tudo bem?',
  'Hmm, então me conta uma história legal.',
  'Você tá estranha.',
  'Lembra?',
])('dirige conversa conhecida para o local: %s', (text) => {
  expect(selectProviderAttempts('llm', cloud, input(text))[0]?.adapter).toBe(
    'openai-local',
  );
});

it.each([
  'Analise este código.',
  'Oi, qual é a função deste transistor?',
  'Conte uma história e demonstre o teorema.',
  'Oi, calcule esta integral.',
  'Explique como funciona um transistor.',
  'a'.repeat(301),
])('mantém complexidade e pedidos desconhecidos na nuvem: %s', (text) => {
  expect(selectProviderAttempts('llm', cloud, input(text))[0]?.adapter).toBe(
    'groq',
  );
});

it('usa a nova fala e preserva local-only, mesmo para pedidos complexos', () => {
  const context = buildVoiceContext(
    [
      {
        userText: 'Analise um código.',
        generatedText: 'Expliquei antes.',
        dataClass: 'personal',
      },
    ],
    'Oi, tudo bem?',
    'personal',
  );
  expect(
    selectProviderAttempts('llm', cloud, { ...context, maxTokens: 64 })[0]
      ?.adapter,
  ).toBe('openai-local');
  expect(
    selectProviderAttempts('llm', cloud, {
      ...input('Analise um código.'),
      dataClass: 'local-only',
    }).map((item) => item.adapter),
  ).toEqual(['openai-local']);
});

function services(factory: ProviderFactory) {
  const config = { ...DEFAULT_PROVIDERS, llm: cloud };
  const repository = { get: async () => config, save: async () => {} };
  const usage = {
    usage: async () => {
      throw new Error('unused');
    },
    reserve: async () => 'reservation',
    settle: async () => {},
  };
  const gate = new ActivityGate(1);

  return {
    ...createProviderStreaming(repository, usage, 'primary', factory, gate),
    ...createProviderExecution(repository, usage, 'primary', factory, gate),
  };
}

it('permite reserva elegível quando o local falha antes do primeiro fragmento', async () => {
  const called: string[] = [];
  const api = services((role, config) => ({
    role,
    transport: 'sse',
    nativeStreaming: true,
    health: async () => {
      throw new Error('unused');
    },
    execute: async () => {
      throw new Error('unused');
    },
    async *stream() {
      called.push(config.adapter);

      if (config.adapter === 'openai-local') {
        throw new ProviderTemporarilyUnavailableError();
      }

      yield {
        content: 'Resposta da reserva.',
        inputTokens: null,
        outputTokens: null,
      };
    },
  }));
  const content = [];

  for await (const chunk of api.executeStream(input('Oi'))) {
    content.push(chunk.content);
  }

  expect(called).toEqual(['openai-local', 'groq']);
  expect(content.join('')).toBe('Resposta da reserva.');
});

it('não gera uma segunda resposta após o local começar a falar', async () => {
  const called: string[] = [];
  const api = services((role, config) => ({
    role,
    transport: 'sse',
    nativeStreaming: true,
    health: async () => {
      throw new Error('unused');
    },
    execute: async () => {
      throw new Error('unused');
    },
    async *stream() {
      called.push(config.adapter);
      yield { content: 'Começou.', inputTokens: null, outputTokens: null };

      throw new ProviderTemporarilyUnavailableError();
    },
  }));

  const consume = async () => {
    for await (const _chunk of api.executeStream(input('Oi'))) {
      void _chunk;
    }
  };

  await expect(consume()).rejects.toThrow();
  expect(called).toEqual(['openai-local']);
});

it('também aplica a seleção local na execução sem streaming', async () => {
  const called: string[] = [];
  const api = services((role, config) => ({
    role,
    transport: 'sse',
    nativeStreaming: true,
    health: async () => {
      throw new Error('unused');
    },
    execute: async () => {
      called.push(config.adapter);

      return { content: 'Oi.', inputTokens: 3, outputTokens: 2 };
    },
  }));
  expect((await api.execute('llm', input('Oi'))).content).toBe('Oi.');
  expect(called).toEqual(['openai-local']);
});

it('nunca envia local-only para a nuvem quando o local está indisponível', async () => {
  const called: string[] = [];
  const api = services((role, config) => ({
    role,
    transport: 'sse',
    nativeStreaming: true,
    health: async () => {
      throw new Error('unused');
    },
    execute: async () => {
      called.push(config.adapter);

      throw new ProviderTemporarilyUnavailableError();
    },
  }));
  await expect(
    api.execute('llm', {
      ...input('Analise este código.'),
      dataClass: 'local-only',
    }),
  ).rejects.toThrow();
  expect(called).toEqual(['openai-local']);
});
