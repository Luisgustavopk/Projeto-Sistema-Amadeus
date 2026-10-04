import { expect, it, vi } from 'vitest';
import { streamPersonaSpeech } from '../../src/application/persona/speech-recovery.ts';
import { buildSpeechOnlyPersonaPrompt } from '../../src/application/persona/prompt.ts';
import {
  ProviderInvalidError,
  QuotaExceededError,
} from '../../src/domain/errors/providers.ts';

async function collect(
  source: Parameters<typeof streamPersonaSpeech>[0],
  signal = new AbortController().signal,
) {
  const recover = vi.fn();
  const expression = vi.fn();
  const text: string[] = [];

  for await (const value of streamPersonaSpeech(
    source,
    signal,
    expression,
    recover,
  )) {
    text.push(value);
  }

  return { text, recover, expression };
}

it.each([
  '',
  '<expression>{"intent":"conversar"}',
  '{"spokenText":"oi"}',
  '*suspira*',
  '(expression)["intent":"conversar"] Olá.',
])('recupera uma vez antes da fala para saída inválida %s', async (invalid) => {
  const attempts: boolean[] = [];
  const result = await collect(async function* (_signal, speechOnly) {
    attempts.push(speechOnly);
    yield speechOnly ? 'Olá, estou ouvindo.' : invalid;
  });
  expect(attempts).toEqual([false, true]);
  expect(result.text).toEqual(['Olá, estou ouvindo.']);
  expect(result.recover).toHaveBeenCalledOnce();
});

it('não regenera depois de entregar uma frase nem repete fala', async () => {
  const attempts: boolean[] = [];
  const stream = streamPersonaSpeech(
    async function* (_signal, speechOnly) {
      attempts.push(speechOnly);
      yield 'Primeira frase. ';

      throw new ProviderInvalidError();
    },
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
  )[Symbol.asyncIterator]();
  expect((await stream.next()).value).toBe('Primeira frase.');
  await expect(stream.next()).rejects.toBeInstanceOf(ProviderInvalidError);
  expect(attempts).toEqual([false]);
});

it('não repete indefinidamente, não contorna cota nem cancelamento', async () => {
  let calls = 0;
  await expect(
    collect(async function* () {
      calls++;

      throw new ProviderInvalidError();
      yield '';
    }),
  ).rejects.toBeInstanceOf(ProviderInvalidError);
  expect(calls).toBe(2);
  calls = 0;
  await expect(
    collect(async function* () {
      calls++;

      throw new QuotaExceededError();
      yield '';
    }),
  ).rejects.toBeInstanceOf(QuotaExceededError);
  expect(calls).toBe(1);
  const controller = new AbortController();
  calls = 0;
  await expect(
    collect(async function* () {
      calls++;
      controller.abort();

      throw new ProviderInvalidError();
      yield '';
    }, controller.signal),
  ).rejects.toBeDefined();
  expect(calls).toBe(1);
});

it('recuperação conserva a persona e remove instruções de metadados', () => {
  const prompt = buildSpeechOnlyPersonaPrompt();
  expect(prompt).toContain('biografia ficcional escolhida');
  expect(prompt).toContain('REFERÊNCIA CURADA:');
  expect(prompt).not.toContain('<expression>');
  expect(prompt).not.toContain('EXPRESSÃO:');
});
