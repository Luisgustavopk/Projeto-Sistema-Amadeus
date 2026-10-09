import { expect, it } from 'vitest';
import { observedSpeech } from '../../src/evaluation/persona/observed-speech.ts';

async function* source() {
  yield 'Hã... obrigada.';
  yield 'Esse detalhe importava.';
}

it('releases speech while classification is unresolved and emits a late expression', async () => {
  let complete!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const events: { initial: boolean; emotion: string }[] = [];
  const pipeline = observedSpeech({
    speech: source(),
    factCount: 0,
    signal: new AbortController().signal,
    classify: async () => pending,
    expression: (value, event) =>
      events.push({ initial: event.initial, emotion: value.emotion }),
  });
  const stream = pipeline.stream()[Symbol.asyncIterator]();
  expect((await stream.next()).value).toBe('Hã... obrigada.');
  expect(events).toEqual([{ initial: true, emotion: 'neutra' }]);
  expect((await stream.next()).value).toBe('Esse detalhe importava.');
  complete({
    intent: 'agradecer',
    emotion: 'constrangimento_leve',
    intensity: 0.3,
  });
  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: null,
  });
  expect(events.at(-1)).toEqual({
    initial: false,
    emotion: 'constrangimento_leve',
  });
});
it('prevents a late update after interruption', async () => {
  const controller = new AbortController();
  const events: boolean[] = [];
  const pipeline = observedSpeech({
    speech: source(),
    factCount: 0,
    signal: controller.signal,
    classify: async () => {
      controller.abort();

      return { intent: 'conversar', emotion: 'neutra', intensity: 0.15 };
    },
    expression: (_value, event) => events.push(event.initial),
  });
  await pipeline.stream()[Symbol.asyncIterator]().next();
  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: 'ABORTED',
  });
  expect(events).toEqual([true]);
});
it('also suppresses a late update when the speech consumer closes', async () => {
  let complete!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const events: boolean[] = [];
  const pipeline = observedSpeech({
    speech: source(),
    factCount: 0,
    signal: new AbortController().signal,
    classify: async () => pending,
    expression: (_value, event) => events.push(event.initial),
  });
  const stream = pipeline.stream()[Symbol.asyncIterator]();
  await stream.next();
  await stream.return?.();
  complete({ intent: 'conversar', emotion: 'neutra', intensity: 0.15 });
  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: 'ABORTED',
  });
  expect(events).toEqual([true]);
});
it('does not weaken persistent-fact protection or accept an invalid classifier result', async () => {
  const options = {
    speech: source(),
    factCount: 1,
    signal: new AbortController().signal,
    classify: async () => ({ emotion: 'fake' }),
    expression: () => {},
  };
  expect(() => observedSpeech(options)).toThrow('fatos persistentes');
  const pipeline = observedSpeech({ ...options, factCount: 0 });

  for await (const text of pipeline.stream()) {
    expect(text).toBeTruthy();
  }

  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: 'INVALID_EXPRESSION',
  });
});

it('keeps speech available when the classifier fails', async () => {
  const expressions: boolean[] = [];
  const pipeline = observedSpeech({
    speech: source(),
    factCount: 0,
    signal: new AbortController().signal,
    classify: async () => {
      throw new Error('Observer unavailable.');
    },
    expression: (_value, event) => expressions.push(event.initial),
  });
  const delivered: string[] = [];

  for await (const text of pipeline.stream()) {
    delivered.push(text);
  }

  expect(delivered).toEqual(['Hã... obrigada.', 'Esse detalhe importava.']);
  expect(await pipeline.observationResult()).toEqual({
    attempted: true,
    error: 'CLASSIFIER_FAILED',
  });
  expect(expressions).toEqual([true]);
});
