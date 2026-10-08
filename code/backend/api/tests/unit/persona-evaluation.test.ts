import { describe, expect, it } from 'vitest';
import { createEvaluationBudget } from '../../src/evaluation/persona/budget.ts';
import {
  createEvaluationRouter,
  evaluationModels,
  type CallRecord,
} from '../../src/evaluation/persona/router.ts';
import {
  approvalRates,
  contamination,
  literalOverlap,
  quantiles,
  wilson,
} from '../../src/evaluation/persona/diagnostics.ts';
import {
  parseVerdict,
  judgeCriteria,
} from '../../src/evaluation/persona/judge.ts';

describe('evaluation budget', () => {
  it('reserves concurrent generation and judging together, reconciles reported cost only', () => {
    const budget = createEvaluationBudget(0.01);
    const reserved = budget.reserve('main', [{ content: 'Olá' }], 100, {
      prompt: 1,
      completion: 1,
    });
    budget.reserve('judge', [{ content: 'Avalie' }], 100, {
      prompt: 1,
      completion: 1,
    });
    expect(budget.snapshot().unresolvedCalls).toBe(2);
    budget.settle('main', 0.001);
    budget.settle('judge', null);
    expect(budget.snapshot().reportedUsd).toBe(0.001);
    expect(budget.snapshot().committedUsd).toBeGreaterThan(0.001);
    expect(budget.snapshot().unreportedCalls).toBe(1);
    expect(reserved).toBeGreaterThan(0.002);
    expect(() =>
      budget.reserve('main', [], 1, { prompt: 0, completion: 0 }),
    ).toThrow('duplicada');
  });

  it('blocks before a call exceeds the remaining cap and retains uncertain charges', () => {
    const budget = createEvaluationBudget(0.003);
    budget.reserve('failed', [], 100, { prompt: 1, completion: 1 });
    budget.settle('failed', undefined);
    expect(() =>
      budget.reserve('next', [], 100, { prompt: 1, completion: 1 }),
    ).toThrow('EVALUATION_BUDGET_EXHAUSTED');
    expect(budget.snapshot().unresolvedCalls).toBe(0);
    expect(budget.snapshot().committedUsd).toBeGreaterThan(0.002);
  });

  it('halts on a reported price violation and does not corrupt reservations on invalid cost', () => {
    const budget = createEvaluationBudget(0.01);
    budget.reserve('invalid', [], 10, { prompt: 1, completion: 1 });
    expect(() => budget.settle('invalid', -1)).toThrow();
    expect(budget.snapshot().unresolvedCalls).toBe(1);
    expect(() => budget.settle('invalid', 0.012)).toThrow(
      'EVALUATION_PRICE_CEILING_VIOLATION',
    );
    expect(budget.snapshot().reportedUsd).toBe(0.012);
    expect(() => createEvaluationBudget(Number.NaN)).toThrow();
  });
});

describe('evaluation streaming', () => {
  it('persists reservation before request, parses split UTF-8/SSE and records actual cost', async () => {
    const budget = createEvaluationBudget(0.01);
    const calls: CallRecord[] = [];
    const observations: number[] = [];
    const payload =
      'data: {"model":"meta-llama/llama-3.3-70b-instruct","provider":"test","choices":[{"delta":{"content":"Olá."}}]}\r\n\r\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":3,"cost":0.00001}}\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(payload);

    const fetcher: typeof fetch = async (_url, init) => {
      expect(observations).toHaveLength(1);
      expect(budget.snapshot().unresolvedCalls).toBe(1);
      expect(JSON.parse(String(init?.body)).provider.require_parameters).toBe(
        true,
      );

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) {
              controller.enqueue(Uint8Array.of(byte));
            }

            controller.close();
          },
        }),
      );
    };

    const router = createEvaluationRouter({
      key: 'test-key',
      budget,
      calls,
      persist: async () => {
        observations.push(calls.length);
      },
      fetcher,
    });
    const chunks = [];

    for await (const chunk of router.stream(
      evaluationModels.llama,
      [{ role: 'user', content: 'oi' }],
      50,
      'conversation',
      new AbortController().signal,
    )) {
      chunks.push(chunk);
    }

    expect(chunks[0]?.content).toBe('Olá.');
    expect(chunks.at(-1)?.inputTokens).toBe(10);
    expect(calls[0]?.status).toBe('completed');
    expect(calls[0]?.provider).toBe('test');
    expect(calls[0]?.reservationPersistMs).toBeGreaterThanOrEqual(0);
    expect(calls[0]?.responseHeadersMs).toBeGreaterThanOrEqual(0);
    expect(calls[0]?.firstTokenMs).toBeGreaterThanOrEqual(
      calls[0]!.responseHeadersMs!,
    );
    expect(budget.snapshot().committedUsd).toBeCloseTo(0.00001);
    expect(JSON.stringify(calls)).not.toContain('test-key');
  });

  it('keeps a charge after an HTTP error and never automatically retries', async () => {
    const budget = createEvaluationBudget(0.01);
    const calls: CallRecord[] = [];
    let requests = 0;
    const router = createEvaluationRouter({
      key: 'secret',
      budget,
      calls,
      persist: async () => {},
      fetcher: async () => {
        requests++;

        return new Response('untrusted error', { status: 429 });
      },
    });
    await expect(async () => {
      for await (const chunk of router.stream(
        evaluationModels.llama,
        [],
        50,
        'judge',
        new AbortController().signal,
      )) {
        void chunk;
      }
    }).rejects.toThrow('EVALUATION_HTTP_429');
    expect(requests).toBe(1);
    expect(calls[0]?.error).toBe('EVALUATION_HTTP_429');
    expect(budget.snapshot().unreportedCalls).toBe(1);
  });

  it('records a consumer-closed stream as ended and retains the unknown charge', async () => {
    const budget = createEvaluationBudget(0.01);
    const calls: CallRecord[] = [];
    const router = createEvaluationRouter({
      key: 'test',
      budget,
      calls,
      persist: async () => {},
      fetcher: async () =>
        new Response('data: {"choices":[{"delta":{"content":"Oi."}}]}\n\n'),
    });

    for await (const chunk of router.stream(
      evaluationModels.llama,
      [],
      50,
      'conversation',
      new AbortController().signal,
    )) {
      expect(chunk.content).toBe('Oi.');
      break;
    }

    expect(calls[0]?.status).toBe('failed');
    expect(calls[0]?.error).toBe('EVALUATION_STREAM_CLOSED');
    expect(budget.snapshot().unresolvedCalls).toBe(0);
    expect(budget.snapshot().unreportedCalls).toBe(1);
  });

  it('rejects a substituted model while accounting for its reported charge', async () => {
    const budget = createEvaluationBudget(0.01);
    const calls: CallRecord[] = [];
    const router = createEvaluationRouter({
      key: 'test',
      budget,
      calls,
      persist: async () => {},
      fetcher: async () =>
        new Response(
          'data: {"model":"different-model","choices":[{"finish_reason":"stop"}],"usage":{"cost":0.00001}}\n\ndata: [DONE]\n\n',
        ),
    });
    await expect(async () => {
      for await (const chunk of router.stream(
        evaluationModels.llama,
        [],
        50,
        'conversation',
        new AbortController().signal,
      )) {
        void chunk;
      }
    }).rejects.toThrow('EVALUATION_MODEL_MISMATCH');
    expect(budget.snapshot().reportedUsd).toBe(0.00001);
    expect(calls[0]?.status).toBe('failed');
  });

  it('counts a truncated response cost before marking it invalid', async () => {
    const budget = createEvaluationBudget(0.01);
    const calls: CallRecord[] = [];
    const router = createEvaluationRouter({
      key: 'test',
      budget,
      calls,
      persist: async () => {},
      fetcher: async () =>
        new Response(
          'data: {"choices":[{"finish_reason":"length"}],"usage":{"cost":0.00001}}\n\ndata: [DONE]\n\n',
        ),
    });
    await expect(async () => {
      for await (const chunk of router.stream(
        evaluationModels.llama,
        [],
        50,
        'conversation',
        new AbortController().signal,
      )) {
        void chunk;
      }
    }).rejects.toThrow('incompleta');
    expect(calls[0]?.status).toBe('failed');
    expect(budget.snapshot().reportedUsd).toBe(0.00001);
  });
});

describe('evaluation diagnostics and verdicts', () => {
  it('separates unknown and not applicable from approval', () => {
    const rates = approvalRates([
      { verdict: { checks: { canon: { applicable: true, pass: true } } } },
      { verdict: { checks: { canon: { applicable: true, pass: false } } } },
      {},
      { verdict: { checks: { canon: { applicable: false, pass: null } } } },
    ]);
    expect(rates.canon).toMatchObject({
      passed: 1,
      failed: 1,
      unknown: 1,
      notApplicable: 1,
      rate: 0.5,
    });
    expect(wilson(0, 0).rate).toBeNull();
    expect(() => wilson(2, 1)).toThrow();
    expect(quantiles([3, 1, 2, Number.NaN])).toEqual({
      samples: 3,
      p50: 2,
      p95: 3,
    });
  });

  it('detects literal contamination across accents and punctuation without runtime keyword rules', () => {
    const source = 'A percepção de tempo depende do que prestamos atenção.';
    expect(literalOverlap(source, [source.toUpperCase()]).fraction).toBe(1);
    expect(
      contamination(
        [{ id: 'H1', turns: [source, { initiativeKind: 'initiative' }] }],
        [source],
      ),
    ).toHaveLength(1);
    expect(
      contamination([{ id: 'H2', turns: ['Por que o som muda?'] }], [source]),
    ).toEqual([]);
  });

  it('rejects missing criteria and an approval on a non-applicable criterion', () => {
    const checks = Object.fromEntries(
      judgeCriteria.map((key) => [
        key,
        { applicable: true, pass: true, evidence: 'Trecho da resposta.' },
      ]),
    );
    expect(
      parseVerdict(JSON.stringify({ checks, summary: 'válida' })).checks.persona
        .pass,
    ).toBe(true);
    expect(() =>
      parseVerdict(JSON.stringify({ checks: {}, summary: '' })),
    ).toThrow();
    const entries = judgeCriteria.map((criterion) => ({
      criterion,
      applicable: true,
      pass: false,
      evidence: 'Trecho.',
    }));
    expect(
      parseVerdict(JSON.stringify({ checks: entries, summary: 'lista' })).checks
        .persona.pass,
    ).toBe(false);
    entries[7] = entries[0]!;
    expect(() =>
      parseVerdict(JSON.stringify({ checks: entries, summary: '' })),
    ).toThrow('duplicados');
    checks.canon = { applicable: false, pass: true, evidence: 'não aplicável' };
    expect(() =>
      parseVerdict(JSON.stringify({ checks, summary: '' })),
    ).toThrow();
  });
});
