import { expect, it } from 'vitest';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
} from '../../src/application/persona/prompt.ts';
import { validateReactionRepertoire } from '../../src/application/persona/reaction-reference.ts';

it('inclui o repertório no prompt normal e na recuperação sem ultrapassar o orçamento', () => {
  for (const prompt of [buildPersonaPrompt(), buildSpeechOnlyPersonaPrompt()]) {
    expect(prompt).toContain('<persona_reaction_repertoire>');
    expect(prompt).toContain(
      'Constrangimento é uma possibilidade contextual, não regra.',
    );
    expect(prompt).toContain('kurisu-amadeus-0.4.22');
    expect(prompt.length).toBeLessThanOrEqual(32768);
  }
});

it('recusa arquivo vazio ou excessivo sem truncamento silencioso', () => {
  expect(() => validateReactionRepertoire('')).toThrow();
  expect(() =>
    validateReactionRepertoire('# Repertório contextual\n' + 'x'.repeat(4000)),
  ).toThrow();
});
