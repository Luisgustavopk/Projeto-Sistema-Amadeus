import { expect, it } from 'vitest';
import { AudioTurnBuffer } from '../../src/domain/voice/audio-buffer.ts';
import { segmentSpeech } from '../../src/domain/voice/segmentation.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';

function frame(sequence: number, turnId = 1) {
  const value = Buffer.alloc(648);
  value.writeUInt32LE(sequence, 0);
  value.writeUInt32LE(turnId, 4);

  return value;
}

it('rejeita sequência duplicada, turno incorreto e tamanho inválido', () => {
  const audio = new AudioTurnBuffer(1);
  audio.append(frame(0));
  expect(() => audio.append(frame(0))).toThrow();
  expect(() => audio.append(frame(1, 2))).toThrow();
  expect(() => audio.append(Buffer.alloc(4))).toThrow();
});
it('limita captura a 30 segundos e exige 100 ms', () => {
  const audio = new AudioTurnBuffer(1);
  expect(() => audio.finish()).toThrow();

  for (let index = 0; index < 1500; index++) {
    audio.append(frame(index));
  }

  expect(audio.finish().length).toBe(960000);
  expect(() => audio.append(frame(1500))).toThrow();
});
it('segmenta frases sem perder palavras dentro do limite de saída', () => {
  const text = 'Uma frase curta. '.repeat(80).trim();
  const segments = segmentSpeech(text);
  expect(segments.every((segment) => segment.length <= 220)).toBe(true);
  expect(segments.join(' ')).toBe(text);
});
it('mantém a classificação mais restritiva do histórico', () => {
  expect(
    buildVoiceContext(
      [
        {
          userText: 'segredo',
          generatedText: 'resposta',
          dataClass: 'personal',
        },
      ],
      'oi',
      'synthetic',
    ).dataClass,
  ).toBe('personal');
  expect(
    buildVoiceContext(
      [{ userText: 'segredo', generatedText: '', dataClass: 'local-only' }],
      'oi',
      'personal',
    ).dataClass,
  ).toBe('local-only');
});
it('limita o contexto de voz a quatro turnos recentes e mensagens curtas', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({
    userText: String(index).repeat(700),
    generatedText: String(index + 1).repeat(700),
    dataClass: 'synthetic' as const,
  }));
  const context = buildVoiceContext(history, 'nova fala', 'synthetic').content;
  expect(context).not.toContain('"user":"0');
  expect(context).toContain('"user":"2');
  expect(context).toContain('2'.repeat(600));
  expect(context).not.toContain('2'.repeat(601));
});
it('troca provedores com chamada ociosa e bloqueia durante um turno', () => {
  const gate = new ActivityGate(1);
  const close = gate.acquireCall();
  const release = gate.beginProviderConfiguration();
  expect(() => gate.beginExecution()).toThrow();
  release();
  const finish = gate.beginExecution();
  expect(() => gate.beginProviderConfiguration()).toThrow();
  finish();
  expect(() => gate.beginConfiguration()).toThrow();
  gate.beginProviderConfiguration()();
  close();
});

it('recusa respostas que excedem o limite em vez de truncar em silêncio', () =>
  expect(() => segmentSpeech('a'.repeat(5281))).toThrow());

import { assertProviderCanExecute } from '../../src/domain/providers/data-policy.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

it('dados locais somente podem usar serviço explicitamente aprovado em loopback', () => {
  const config = ProviderSchema.parse({
    adapter: 'http-json',
    endpoint: 'http://127.0.0.1:8001',
    dataPolicy: 'local-approved',
  });
  expect(() => assertProviderCanExecute(config, 'local-only')).not.toThrow();
  expect(
    ProviderSchema.safeParse({ ...config, endpoint: 'https://example.com' })
      .success,
  ).toBe(false);
  expect(() =>
    assertProviderCanExecute(
      ProviderSchema.parse({
        adapter: 'gemini',
        model: 'gemini-3.8-flash',
        apiKeyEnv: 'GEMINI_API_KEY',
      }),
      'local-only',
    ),
  ).toThrow();
});
