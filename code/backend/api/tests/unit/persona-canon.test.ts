import { expect, it } from 'vitest';
import { buildVoicePersonaPrompt } from '../../src/application/persona/voice-prompt.ts';
import { buildPersonaPrompt } from '../../src/application/persona/prompt.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { PERSONA_CANON_REFERENCE } from '../../src/application/persona/canon-reference.ts';

it('usa a mesma curadoria com proveniência em produção, comparação e recuperação', () => {
  for (const prompt of [
    buildVoicePersonaPrompt(),
    buildVoicePersonaPrompt(true),
    buildPersonaPrompt(),
  ]) {
    expect(prompt.split(PERSONA_CANON_REFERENCE)).toHaveLength(2);
    expect(prompt).toContain('9d4726bd37dce9919af37904e442e49205f329b8');
  }

  expect(buildVoicePersonaPrompt().length).toBeLessThanOrEqual(12500);
  const context = buildVoiceContext(
    [],
    'Olá.',
    'synthetic',
    undefined,
    undefined,
    true,
  );
  expect(context.systemPrompt).toContain(PERSONA_CANON_REFERENCE);
  expect(context.content).not.toContain(PERSONA_CANON_REFERENCE);
});
