import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  extractPersonaSkill,
  PERSONA_SKILL_REFERENCE,
} from '../../src/application/persona/skill-reference.ts';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
} from '../../src/application/persona/prompt.ts';
import {
  buildConversationStyle,
  createConversationStyleGuard,
} from '../../src/application/persona/conversation-style.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { measureVoiceAudio } from '../../src/application/voice/audio-observations.ts';
import { streamPersonaSpeech } from '../../src/application/persona/speech-recovery.ts';
import { validateProviderInput } from '../../src/application/providers/input.ts';
import { ExpressionSchema } from '../../src/domain/persona/expression.ts';
import { screenPersonaResponse } from '../../src/domain/persona/evaluation.ts';

const turn = {
  userText: 'Um assunto.',
  generatedText: 'A hipótese precisa de uma medição antes da conclusão.',
  dataClass: 'synthetic' as const,
};

it('carrega a skill real nos dois prompts e preserva formato e enquadramento de ficção', () => {
  const file = readFileSync(
    new URL(
      '../../src/application/persona/skill-amadeus-kurisu.md',
      import.meta.url,
    ),
    'utf8',
  );
  const prompt = buildPersonaPrompt();
  expect(PERSONA_SKILL_REFERENCE).toContain(extractPersonaSkill(file));
  expect(prompt).toContain(PERSONA_SKILL_REFERENCE);
  expect(buildSpeechOnlyPersonaPrompt()).toContain(PERSONA_SKILL_REFERENCE);
  expect(prompt).toContain('FICÇÃO EXPLÍCITA:');
  expect(prompt).toContain('D12:');
  expect(prompt.indexOf('</amadeus_conversation_skill>')).toBeLessThan(
    prompt.indexOf('\nEXPRESSÃO:'),
  );
  expect(() =>
    validateProviderInput('llm', {
      content: 'Teste.',
      systemPrompt: prompt,
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).not.toThrow();
  expect(() =>
    validateProviderInput('llm', {
      content: 'Teste.',
      systemPrompt: 'x'.repeat(32769),
      dataClass: 'synthetic',
      maxTokens: 512,
    }),
  ).toThrow();
  expect(
    ExpressionSchema.parse({
      intent: 'ceder_turno',
      emotion: 'neutra',
      intensity: 0.15,
    }).intent,
  ).toBe('ceder_turno');
});

it('deriva familiaridade e cinco aberturas/fechos apenas do histórico confirmado', () => {
  expect(buildConversationStyle([]).familiarity).toBe('F0');
  expect(buildConversationStyle(Array(3).fill(turn)).familiarity).toBe('F1');
  expect(buildConversationStyle(Array(10).fill(turn)).familiarity).toBe('F2');
  expect(
    buildConversationStyle(Array(10).fill({ ...turn, partiallyPlayed: true }))
      .familiarity,
  ).toBe('F0');
  const style = buildConversationStyle(Array(12).fill(turn));
  expect(style.recentStyle).toHaveLength(5);
  expect(
    buildConversationStyle(Array(12).fill({ ...turn, generatedText: '' }))
      .recentStyle,
  ).toEqual([]);
  expect(buildVoiceContext([turn], 'Olá.', 'synthetic').content).toContain(
    'recentStyle',
  );
});

it('recupera uma abertura repetida antes de enviar áudio e permite repetição solicitada', async () => {
  const recover = vi.fn();
  const result: string[] = [];

  for await (const text of streamPersonaSpeech(
    async function* (_signal, speechOnly) {
      yield speechOnly
        ? 'Uma medição ajuda a separar hipótese de resultado.'
        : turn.generatedText;
    },
    new AbortController().signal,
    vi.fn(),
    recover,
    createConversationStyleGuard([turn], 'E agora?'),
  )) {
    result.push(text);
  }

  expect(recover).toHaveBeenCalledOnce();
  expect(result).toEqual([
    'Uma medição ajuda a separar hipótese de resultado.',
  ]);
  expect(() =>
    createConversationStyleGuard([turn], 'Repete exatamente.')(
      turn.generatedText,
      false,
    ),
  ).not.toThrow();
  expect(() =>
    createConversationStyleGuard([], 'Oi.')('Claro! Como posso ajudar?', false),
  ).toThrow();
});

it('mede duração, energia, pausas e ritmo sem inventar emoção ou tom', () => {
  const pcm = Buffer.alloc(32000);

  for (let index = 0; index < 16000; index += 2) {
    pcm.writeInt16LE(16384, index);
  }

  const observations = measureVoiceAudio(
    { pcmBase64: pcm.toString('base64'), sampleRate: 16000, channels: 1 },
    'Uma frase curta aqui.',
  );
  expect(observations).toMatchObject({
    durationSeconds: 1,
    peak: 0.5,
    lowEnergyFrameFraction: 0.5,
    estimatedWordsPerSecondIncludingPauses: 4,
  });
  expect(observations?.rms).toBeCloseTo(Math.sqrt(0.125), 3);
  expect(buildVoiceContext([], 'Texto.', 'synthetic').content).not.toContain(
    'Medições acústicas',
  );
  expect(
    buildVoiceContext([], 'Texto.', 'personal', undefined, observations)
      .content,
  ).toContain('no emotion classifier');
  expect(
    screenPersonaResponse(
      'Nesse dia fictício, passei o dia no laboratório.',
      true,
      'Imagine um dia fictício.',
    ).flags,
  ).not.toContain('possible-invented-physical-activity');
  expect(
    screenPersonaResponse(
      'Passei o dia no laboratório.',
      true,
      'O que fez de verdade?',
    ).flags,
  ).toContain('possible-invented-physical-activity');
});
