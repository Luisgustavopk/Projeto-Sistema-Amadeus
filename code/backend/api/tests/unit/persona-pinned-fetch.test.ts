import { describe, expect, it } from 'vitest';
import { createPinnedEvaluationFetch } from '../../src/evaluation/persona/pinned-fetch.ts';
import { createEvaluationBudget } from '../../src/evaluation/persona/budget.ts';
import {
  createEvaluationRouter,
  evaluationModels,
  type CallRecord,
} from '../../src/evaluation/persona/router.ts';

describe('isolated evaluation route', () => {
  it('locates the matching durable request when another independent request is pending', async () => {
    const request = {
      model: 'model',
      messages: [{ role: 'user', content: 'speech' }],
    };
    const calls: CallRecord[] = [
      {
        id: 'speech',
        model: 'model',
        purpose: 'conversation',
        request,
        reservedUsd: 0.001,
        status: 'pending',
      },
      {
        id: 'observer',
        model: 'model',
        purpose: 'expression-observer',
        request: {
          model: 'model',
          messages: [{ role: 'user', content: 'classification' }],
        },
        reservedUsd: 0.001,
        status: 'pending',
      },
    ];
    const fetcher = createPinnedEvaluationFetch({
      calls,
      models: [{ id: 'model', providerOnly: 'fixed' }],
      persist: async () => {},
      fetcher: async () => new Response(),
    });
    await fetcher('https://example.test', { body: JSON.stringify(request) });
    expect(calls[0]?.request.provider).toMatchObject({ only: ['fixed'] });
    expect(calls[1]?.request).not.toHaveProperty('provider');
  });

  it('pins Qwen2.5 to DeepInfra without adding unsupported reasoning parameters', async () => {
    const request = {
      model: 'qwen/qwen-2.5-72b-instruct',
      messages: [{ role: 'user', content: 'Oi.' }],
      provider: {
        max_price: { prompt: 0.36, completion: 0.4, request: 0 },
        data_collection: 'deny',
      },
    };
    const calls: CallRecord[] = [
      {
        id: 'qwen-test',
        model: request.model,
        purpose: 'comparison',
        request,
        reservedUsd: 0.001,
        status: 'pending',
      },
    ];
    let persisted = false;
    const fetcher = createPinnedEvaluationFetch({
      calls,
      models: [{ id: request.model, providerOnly: 'deepinfra/fp8' }],
      persist: async () => {
        persisted = true;
      },
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(persisted).toBe(true);
        expect(body).not.toHaveProperty('reasoning');
        expect(body.provider).toEqual({
          ...request.provider,
          only: ['deepinfra/fp8'],
          allow_fallbacks: false,
        });
        expect(calls[0]?.request).toEqual(body);

        return new Response();
      },
    });
    await fetcher('https://example.test', { body: JSON.stringify(request) });
  });

  it('persists the final pinned request before inference without exposing the key', async () => {
    const calls: CallRecord[] = [];
    const budget = createEvaluationBudget(0.01);
    const persisted: unknown[] = [];

    const persist = async () => {
      persisted.push(JSON.parse(JSON.stringify(calls)));
    };

    const fetcher = createPinnedEvaluationFetch({
      calls,
      persist,
      models: [
        {
          id: evaluationModels.llama.id,
          providerOnly: 'fixed/provider',
          disableReasoning: true,
        },
      ],
      fetcher: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(persisted).toHaveLength(2);
        expect(calls[0]?.request).toEqual(body);
        expect(body.provider).toMatchObject({
          only: ['fixed/provider'],
          allow_fallbacks: false,
          data_collection: 'deny',
        });
        expect(body.reasoning).toEqual({ enabled: false });

        return new Response(
          'data: {"model":"meta-llama/llama-3.3-70b-instruct","choices":[{"delta":{"content":"Oi."},"finish_reason":"stop"}],"usage":{"cost":0.00001}}\n\ndata: [DONE]\n\n',
        );
      },
    });
    const router = createEvaluationRouter({
      key: 'secret',
      budget,
      calls,
      persist,
      fetcher,
    });

    for await (const chunk of router.stream(
      evaluationModels.llama,
      [],
      100,
      'comparison',
      new AbortController().signal,
    )) {
      void chunk;
    }

    expect(calls[0]?.status).toBe('completed');
    expect(budget.snapshot().reportedUsd).toBe(0.00001);
    expect(JSON.stringify(persisted)).not.toContain('secret');
  });

  it('blocks a request without its durable matching call record', async () => {
    let paidCalls = 0;
    const fetcher = createPinnedEvaluationFetch({
      calls: [],
      models: [{ id: 'model', providerOnly: 'fixed' }],
      persist: async () => {},
      fetcher: async () => {
        paidCalls++;

        return new Response();
      },
    });
    await expect(
      fetcher('https://example.test', {
        body: JSON.stringify({ model: 'model' }),
      }),
    ).rejects.toThrow('EVALUATION_ROUTE_RECORD_MISMATCH');
    expect(paidCalls).toBe(0);
  });
});
