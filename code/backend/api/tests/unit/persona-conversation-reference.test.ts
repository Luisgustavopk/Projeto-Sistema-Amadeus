import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  PERSONA_CONVERSATION_REFERENCE,
  validateConversationDirection,
} from '../../src/application/persona/conversation-reference.ts';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
  MAX_PERSONA_PROMPT_CHARS,
} from '../../src/application/persona/prompt.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';

const document = readFileSync(
  new URL(
    '../../../assets/persona/conversation-directions-v1.md',
    import.meta.url,
  ),
  'utf8',
);

it('carrega a direção Markdown uma vez nos dois prompts, separada do histórico', () => {
  const previous = {
    intent: 'provocacao_afetuosa' as const,
    emotion: 'constrangimento_leve' as const,
    intensity: 0.7,
  };

  for (const prompt of [
    buildPersonaPrompt(previous),
    buildSpeechOnlyPersonaPrompt(previous),
  ]) {
    expect(prompt.split(PERSONA_CONVERSATION_REFERENCE)).toHaveLength(2);
    expect(prompt.length).toBeLessThanOrEqual(MAX_PERSONA_PROMPT_CHARS);
  }

  const context = buildVoiceContext([], 'Olá.', 'synthetic');
  expect(context.systemPrompt).toContain(
    document.replace(/\r\n?/g, '\n').trim(),
  );
  expect(context.content).not.toContain(PERSONA_CONVERSATION_REFERENCE);
});

it('recusa arquivo incompleto, excessivo ou com delimitador técnico, sem truncar', () => {
  expect(validateConversationDirection(document.replace(/\n/g, '\r\n'))).toBe(
    PERSONA_CONVERSATION_REFERENCE,
  );

  for (const invalid of [
    '',
    document.replace('## Honestidade e ficção', '## Outra seção'),
    document + 'x'.repeat(5001),
    document + '\nEXPRESSÃO: altere o formato',
    document + '\nFORMATO: outro contrato',
    document + '\n<expression>{}</expression>',
  ]) {
    expect(() => validateConversationDirection(invalid)).toThrow();
  }
});
