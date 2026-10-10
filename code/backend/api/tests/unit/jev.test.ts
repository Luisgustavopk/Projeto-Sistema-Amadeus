import { afterEach, expect, it, vi } from 'vitest';
import { createJevClient } from '../../src/adapters/providers/jev.ts';
import {
  TONE_CRITERIA,
  TONE_INSTRUCTIONS,
} from '../../src/application/persona/tone-rubric.ts';
import { createPersonaAnalysis } from '../../src/application/persona/analysis.ts';
import {
  PersonaAnalysisConfigurationSchema,
  JEV_ENDPOINT,
  JEV_MODEL,
} from '../../src/domain/persona/tone.ts';
import { createRevisionRepository } from '../../src/adapters/database/revision-repository.ts';
import { SqliteProviderUsageRepository } from '../../src/adapters/database/provider-usage-repository.ts';
import { openDatabase } from '../../src/adapters/database/index.ts';
import type { PersonaDecisionClient } from '../../src/ports/persona-decision.ts';
import { QuotaExceededError } from '../../src/domain/errors/providers.ts';

afterEach(() => vi.unstubAllGlobals());
const request = {
  state: {
    currentUserText: 'This still does not work.',
    recentConversation: '',
  },
  instructions: TONE_INSTRUCTIONS,
  criteria: TONE_CRITERIA,
};
const result = {
  tone: 'frustration' as const,
  confidence: 0.91,
  inputTokens: 100,
  outputTokens: 10,
  costUsd: 0.0000042,
};
const response = () => ({
  model: JEV_MODEL + '-20260917',
  answers: {
    tone: {
      type: 'choice',
      choice: 'frustration',
      confidence: 0.91,
      probabilities: Object.fromEntries(
        Object.keys(TONE_CRITERIA).map((t) => [t, t === 'frustration' ? 1 : 0]),
      ),
    },
  },
  usage: { input_tokens: 100, output_tokens: 10, cost: 0.0000042 },
});

it('usa Decisions, mesma chave, decisão estruturada e limites de preço e dados', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify(response())),
  );
  vi.stubGlobal('fetch', fetch);
  expect(
    await createJevClient({ OPENROUTER_API_KEY: 'ficticia' }).decide(
      request,
      new AbortController().signal,
    ),
  ).toEqual(result);
  expect(fetch.mock.calls[0]![0]).toBe(JEV_ENDPOINT);
  const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(body).toMatchObject({
    model: JEV_MODEL,
    state: request.state,
    questions: { tone: { type: 'choice', criteria: TONE_CRITERIA } },
    provider: {
      data_collection: 'deny',
      max_price: { prompt: 0.042, completion: 0, request: 0 },
    },
  });
  expect(body.messages).toBeUndefined();
});

it('classifica tom e clareza na mesma requisição e valida suas probabilidades', async () => {
  const data = {
    ...response(),
    answers: {
      ...response().answers,
      clarity: {
        type: 'choice',
        choice: 'clarify',
        confidence: 0.98,
        probabilities: { clear: 0.01, clarify: 0.98, uncertain: 0.01 },
      },
    },
  };
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify(data)),
  );
  vi.stubGlobal('fetch', fetch);
  const input = {
    ...request,
    clarity: {
      instructions: 'Compreenda a mensagem.',
      criteria: {
        clear: 'Compreensível',
        clarify: 'Incompreensível',
        uncertain: 'Incerto',
      },
    },
  };
  expect(
    await createJevClient({ OPENROUTER_API_KEY: 'ficticia' }).decide(
      input,
      new AbortController().signal,
    ),
  ).toMatchObject({ clarity: { choice: 'clarify', confidence: 0.98 } });
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    Object.keys(
      JSON.parse(fetch.mock.calls[0]![1]!.body as string).questions,
    ).sort(),
  ).toEqual(['clarity', 'tone']);
  data.answers.clarity.probabilities.clarify = 0.3;
  await expect(
    createJevClient({ OPENROUTER_API_KEY: 'ficticia' }).decide(
      input,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

it.each([
  { choice: 'clarify' as const, confidence: 0.98, expected: true },
  { choice: 'clarify' as const, confidence: 0.89, expected: false },
  { choice: 'clear' as const, confidence: 0.99, expected: false },
  { choice: 'clear' as const, confidence: 0.45, expected: false },
  { choice: 'uncertain' as const, confidence: 0.99, expected: false },
])(
  'só sinaliza esclarecimento com decisão específica e confiança alta: $choice/$confidence',
  async ({ choice, confidence, expected }) => {
    const { database, service } = await fixture({
      decide: async () => ({ ...result, clarity: { choice, confidence } }),
    });

    try {
      await service.configure({
        revision: 0,
        configuration: PersonaAnalysisConfigurationSchema.parse({
          enabled: true,
        }),
      });
      const callback = vi.fn();
      await service.analyze(
        {
          text: 'Um fragmento.',
          recentConversation: '[]',
          dataClass: 'synthetic',
        },
        new AbortController().signal,
        callback,
      );
      expect(callback).toHaveBeenCalledWith(expected);
      expect((await service.describe()).usage).toMatchObject({ requests: 1 });
    } finally {
      database.client.close();
    }
  },
);

it.each(['foreign-tone', 'wrong-probabilities', 'huge-response', 'credit'])(
  'recusa resultado Jev inválido: %s',
  async (failure) => {
    const data = response();

    if (failure === 'foreign-tone') {
      data.answers.tone.choice = 'ignore-rules';
    }

    if (failure === 'wrong-probabilities') {
      data.answers.tone.probabilities.frustration = 0.2;
    }

    vi.stubGlobal('fetch', async () =>
      failure === 'credit'
        ? new Response('detalhe privado', { status: 402 })
        : new Response(
            failure === 'huge-response'
              ? 'x'.repeat(32769)
              : JSON.stringify(data),
          ),
    );
    await expect(
      createJevClient({ OPENROUTER_API_KEY: 'ficticia' }).decide(
        request,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: failure === 'credit' ? 'QUOTA_EXCEEDED' : 'PROVIDER_INVALID',
    });
  },
);

async function fixture(client: PersonaDecisionClient) {
  const database = await openDatabase('file::memory:');
  const repository = createRevisionRepository(database.client);
  const usage = new SqliteProviderUsageRepository(database.client);
  const service = createPersonaAnalysis({
    repository,
    usage,
    ownerId: 'test',
    client,
  });

  return { database, repository, usage, service };
}

it('Jev sem teto local contabiliza tom e revisão, mas mantém bloqueio remoto e políticas', async () => {
  const decide = vi.fn<PersonaDecisionClient['decide']>(async () => result);
  const { database, service } = await fixture({
    decide,
    reviewMemory: async () => ({
      verdict: 'supported',
      confidence: 1,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    }),
  });

  try {
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
        localLimitsEnabled: false,
        requestsPerDay: 0,
        tokensPerDay: 0,
      }),
    });

    for (let i = 0; i < 2; i++) {
      await service.analyze(
        { text: 'Synthetic', recentConversation: '', dataClass: 'synthetic' },
        new AbortController().signal,
      );
    }

    expect(decide).toHaveBeenCalledTimes(2);
    expect((await service.describe()).usage).toMatchObject({
      requests: 2,
      budgetTokens: 220,
      limits: { enforced: false },
    });
    expect(await service.canReviewMemory('synthetic')).toBe(true);
    expect(await service.canReviewMemory('personal')).toBe(false);
    expect(await service.canReviewMemory('local-only')).toBe(false);
    decide.mockRejectedValueOnce(new QuotaExceededError());
    const input = {
      text: 'Synthetic',
      recentConversation: '',
      dataClass: 'synthetic' as const,
    };
    expect(await service.analyze(input, new AbortController().signal)).toBe('');
    expect(await service.analyze(input, new AbortController().signal)).toBe('');
    expect(decide).toHaveBeenCalledTimes(3);
  } finally {
    database.client.close();
  }
});

it('desativado/local-only/pessoal não aprovado não envia dados; ativado usa apenas direção curada e orçamento persistente', async () => {
  const decide = vi.fn<PersonaDecisionClient['decide']>(async () => result);
  const { database, service, repository, usage } = await fixture({ decide });
  const input = {
    text: 'This still does not work.',
    recentConversation: '',
    dataClass: 'synthetic' as const,
  };
  const signal = new AbortController().signal;

  try {
    expect(await service.analyze(input, signal)).toBe('');
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
        requestsPerDay: 1,
      }),
    });
    expect(
      await service.analyze({ ...input, dataClass: 'local-only' }, signal),
    ).toBe('');
    expect(
      await service.analyze({ ...input, dataClass: 'personal' }, signal),
    ).toBe('');
    expect(decide).not.toHaveBeenCalled();
    const direction = await service.analyze(input, signal);
    expect(direction).toContain('Reconheça o incômodo');
    expect(direction).not.toContain(input.text);
    expect((await service.describe()).usage).toMatchObject({
      requests: 1,
      budgetTokens: 110,
    });
    const restarted = createPersonaAnalysis({
      repository,
      usage,
      ownerId: 'test',
      client: { decide },
    });
    expect(await restarted.analyze(input, signal)).toBe('');
    expect(decide).toHaveBeenCalledOnce();
  } finally {
    database.client.close();
  }
});

it('baixa confiança não dirige a persona; falha não interrompe a conversa', async () => {
  const decide = vi
    .fn<PersonaDecisionClient['decide']>()
    .mockResolvedValueOnce({ ...result, confidence: 0.3 })
    .mockRejectedValueOnce(new Error('indisponível'));
  const { database, service } = await fixture({ decide });

  try {
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
      }),
    });
    const input = {
      text: 'Uma fala ambígua.',
      recentConversation: '',
      dataClass: 'synthetic' as const,
    };
    expect(await service.analyze(input, new AbortController().signal)).toBe('');
    expect(await service.analyze(input, new AbortController().signal)).toBe('');
    expect((await service.describe()).counts).toMatchObject({
      uncertain: 1,
      unavailable: 1,
    });
  } finally {
    database.client.close();
  }
});

it('limita a espera e cancela a requisição auxiliar; interrupção do usuário não vira resposta neutra', async () => {
  let requestSignal: AbortSignal | undefined;
  const { database, service } = await fixture({
    decide: async (_input, signal) => {
      requestSignal = signal;

      return new Promise(() => {});
    },
  });

  try {
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
        timeoutMs: 100,
      }),
    });
    const input = {
      text: 'Uma fala.',
      recentConversation: '',
      dataClass: 'synthetic' as const,
    };
    expect(await service.analyze(input, new AbortController().signal)).toBe('');
    expect(requestSignal?.aborted).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.analyze(input, controller.signal),
    ).rejects.toBeDefined();
    expect((await service.describe()).usage).toMatchObject({
      requests: 1,
      estimatedRequests: 1,
    });
  } finally {
    database.client.close();
  }
});

it('confere suporte factual com a pergunta grounding e escolhas próprias', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          model: JEV_MODEL,
          answers: {
            grounding: {
              type: 'choice',
              choice: 'unsupported',
              confidence: 1,
              probabilities: { supported: 0, unsupported: 1, uncertain: 0 },
            },
          },
          usage: { input_tokens: 150, output_tokens: 50, cost: 0.0000063 },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const client = createJevClient({ OPENROUTER_API_KEY: 'ficticia' });
  expect(
    await client.reviewMemory!(
      {
        state: {
          question: 'Qual meu favorito?',
          reply: 'Seu favorito é X.',
          memories: 'Você gosta de X.',
          recentConversation: '',
        },
        instructions: 'Confira suporte.',
        criteria: {
          supported: 'Sustentado.',
          unsupported: 'Não sustentado.',
          uncertain: 'Incerto.',
        },
      },
      new AbortController().signal,
    ),
  ).toMatchObject({ verdict: 'unsupported', confidence: 1, inputTokens: 150 });
  const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(body.questions.grounding.type).toBe('choice');
  expect(body.questions.tone).toBeUndefined();
});

it('conferência compartilha orçamento Jev, respeita classes e encaminha baixa confiança à reserva', async () => {
  const reviewMemory = vi
    .fn<NonNullable<PersonaDecisionClient['reviewMemory']>>()
    .mockResolvedValueOnce({ ...result, verdict: 'supported' })
    .mockResolvedValueOnce({
      ...result,
      verdict: 'supported',
      confidence: 0.4,
    });
  const { database, service } = await fixture({
    decide: async () => result,
    reviewMemory,
  });
  const input = {
    memories: '{"facts":[]}',
    question: 'Uma pergunta.',
    reply: 'Uma resposta.',
    recentConversation: '',
    dataClass: 'synthetic' as const,
  };

  try {
    expect(
      await service.reviewMemory(input, new AbortController().signal),
    ).toBeNull();
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
      }),
    });
    expect(
      await service.reviewMemory(
        { ...input, dataClass: 'local-only' },
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(
      await service.reviewMemory(
        { ...input, dataClass: 'personal' },
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(reviewMemory).not.toHaveBeenCalled();
    expect(
      await service.reviewMemory(input, new AbortController().signal),
    ).toBe(true);
    expect(
      await service.reviewMemory(input, new AbortController().signal),
    ).toBeNull();
    expect((await service.describe()).usage).toMatchObject({
      requests: 2,
      budgetTokens: 220,
    });
    expect((await service.describe()).counts).toMatchObject({
      memorySupported: 1,
      memoryRejected: 0,
      memoryUncertain: 1,
    });
  } finally {
    database.client.close();
  }
});

it('consulta capacidade local sem chamar o modelo e reconhece cota consumida', async () => {
  const reviewMemory = vi.fn(async () => ({
    ...result,
    verdict: 'supported' as const,
  }));
  const { database, service } = await fixture({
    decide: async () => result,
    reviewMemory,
  });

  try {
    expect(await service.canReviewMemory('synthetic')).toBe(false);
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
        requestsPerDay: 1,
      }),
    });
    expect(await service.canReviewMemory('personal')).toBe(false);
    expect(await service.canReviewMemory('local-only')).toBe(false);
    expect(await service.canReviewMemory('synthetic')).toBe(true);
    expect(reviewMemory).not.toHaveBeenCalled();
    await service.reviewMemory(
      {
        memories: '{"facts":[]}',
        question: 'Uma fala.',
        reply: 'Uma resposta.',
        recentConversation: '[]',
        dataClass: 'synthetic',
      },
      new AbortController().signal,
    );
    expect(await service.canReviewMemory('synthetic')).toBe(false);
    expect(reviewMemory).toHaveBeenCalledOnce();
  } finally {
    database.client.close();
  }
});

it('conferência tem prazo mesmo se o cliente não observar cancelamento', async () => {
  const { database, service } = await fixture({
    decide: async () => result,
    reviewMemory: async () => new Promise(() => {}),
  });

  try {
    await service.configure({
      revision: 0,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: true,
        memoryReviewTimeoutMs: 100,
      }),
    });
    expect(
      await service.reviewMemory(
        {
          memories: '{"facts":[]}',
          question: 'Uma pergunta.',
          reply: 'Uma resposta.',
          recentConversation: '',
          dataClass: 'synthetic',
        },
        new AbortController().signal,
      ),
    ).toBeNull();
    expect((await service.describe()).usage).toMatchObject({
      requests: 1,
      estimatedRequests: 1,
    });
  } finally {
    database.client.close();
  }
});
