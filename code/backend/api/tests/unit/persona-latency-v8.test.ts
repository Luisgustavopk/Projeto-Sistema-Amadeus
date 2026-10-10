import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  isolateDemonstrations,
  functionPassages,
} from '../../src/evaluation/persona/isolated-examples.ts';
import { ShotBankSchema } from '../../src/evaluation/persona/experimental-suite.ts';
import { createParallelExpressionSpeech } from '../../src/application/persona/parallel-expression.ts';

it('keeps fictional scenes outside the real dialogue while preserving history verbatim', () => {
  const history = [
    { role: 'user', content: 'My new topic.' },
    { role: 'assistant', content: 'Uma reação real.' },
  ];
  const messages = [
    { role: 'system', content: 'Núcleo.' },
    { role: 'user', content: 'Objeto fictício.' },
    { role: 'assistant', content: 'Erro fictício.' },
    ...history,
    { role: 'user', content: 'Continue.' },
  ];
  const original = JSON.stringify(messages);
  const isolated = isolateDemonstrations(messages, history.length);
  expect(isolated.filter((m) => m.role !== 'system')).toEqual([
    ...history,
    messages.at(-1),
  ]);
  expect(isolated[1]!.content).toContain('Referências de atuação fictícias');
  expect(isolated[1]!.content).toContain('Objeto fictício.');
  expect(isolated[2]!.content).toContain('conversa real');
  expect(JSON.stringify(messages)).toBe(original);
});

it('ranks source interaction functions without injecting scene details or evaluation labels', async () => {
  const bank = ShotBankSchema.parse(
    JSON.parse(
      await readFile(
        new URL(
          '../../../evals/persona/quality-v7/shots-sequences.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const descriptors = functionPassages(bank);
  expect(descriptors.length).toBeGreaterThan(0);
  expect(
    descriptors.every((d) =>
      bank.shots.some(
        (s) =>
          s.id === d.id && !s.facts.length && s.kind === 'style-adaptation',
      ),
    ),
  ).toBe(true);
  expect(
    descriptors.find((d) => d.id === 'estilo-evidencia')!.description,
  ).not.toContain('arquivo');
  const suite = JSON.parse(
    await readFile(
      new URL(
        '../../../evals/persona/quality-v8/conversations.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const exampleInputs = new Set(
    bank.shots.flatMap((s) =>
      s.messages.filter((m) => m.role === 'user').map((m) => m.content.trim()),
    ),
  );

  for (const scenario of [...suite.development, ...suite.reserved]) {
    for (const turn of scenario.turns) {
      expect(exampleInputs.has(turn)).toBe(false);
    }
  }
});

it('delivers speech before a slow classifier and preserves late full-intensity metadata', async () => {
  let release: (value: unknown) => void = () => {};

  const classification = new Promise((resolve) => {
    release = resolve;
  });
  const expressions: unknown[] = [];
  const pipeline = createParallelExpressionSpeech({
    source: async function* () {
      yield 'Essa notícia me pegou de surpresa.';
    },
    signal: new AbortController().signal,
    factCount: 0,
    classify: async () => classification,
    onExpression: (value, event) => expressions.push({ ...value, ...event }),
  });
  const stream = pipeline.stream()[Symbol.asyncIterator]();
  expect((await stream.next()).value).toBe(
    'Essa notícia me pegou de surpresa.',
  );
  expect(expressions).toHaveLength(1);
  release({ intent: 'reagir', emotion: 'surpresa', intensity: 1 });
  expect((await stream.next()).done).toBe(true);
  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: null,
  });
  expect(expressions.at(-1)).toMatchObject({
    emotion: 'surpresa',
    intensity: 1,
    valid: true,
    deliveryApplied: false,
  });
});

it('does not turn speech-only mode into a bypass of persistent fact review', () => {
  expect(() =>
    createParallelExpressionSpeech({
      source: async function* () {
        yield 'Um fato.';
      },
      signal: new AbortController().signal,
      factCount: 1,
      classify: async () => ({}),
      onExpression: () => {},
    }),
  ).toThrow('fatos persistentes');
});
