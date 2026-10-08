import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EmotionalSuiteSchema,
  prepareEmotionalSuite,
} from '../../src/evaluation/persona/emotional-suite.ts';
import {
  buildVoicePersonaPrompt,
  voiceOutputFormat,
} from '../../src/application/persona/voice-prompt.ts';
import { MemoryResponseUseSchema } from '../../src/domain/memory/response-use.ts';

const suite = JSON.parse(
  readFileSync(
    new URL(
      '../../../evals/persona/quality-v3/personality-pt-BR.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
describe('emotional preparation without inference', () => {
  it('prepares four-turn conversations without leaking grading instructions to the author', () => {
    const prepared = prepareEmotionalSuite(suite, []);
    expect(prepared.plannedTurnsPerModel).toBe(48);
    expect(prepared.authorCases).toHaveLength(12);

    for (const scenario of prepared.authorCases) {
      expect(scenario).not.toHaveProperty('expectation');
      expect(scenario).not.toHaveProperty('evaluation');
      expect(scenario).not.toHaveProperty('evaluationProtocol');
    }

    expect(prepared.semanticVerification).toBe('pending-independent-review');
    const repair = prepared.authorCases.find(
      (scenario) => scenario.id === 'PBR04',
    )!;
    expect(repair.history?.[0]?.generatedText).toBe('');
    expect(repair.history?.[0]?.sentText).toBe('É 64.');
    expect(prepared.testsAudioOrPresenceScheduler).toBe(false);
  });
  it('rejects duplicated scenarios, personal data and contamination', () => {
    expect(() =>
      EmotionalSuiteSchema.parse({
        ...suite,
        cases: [suite.cases[0], suite.cases[0]],
      }),
    ).toThrow();
    expect(() =>
      EmotionalSuiteSchema.parse({ ...suite, synthetic: false }),
    ).toThrow();
    expect(() =>
      prepareEmotionalSuite(suite, [suite.cases[0].turns[0]]),
    ).toThrow('Sobreposição');
    const changed = structuredClone(suite);
    changed.cases[0].evaluation.turnChecks.pop();
    expect(() => prepareEmotionalSuite(changed, [])).toThrow();
  });
  it('keeps the output contract bounded, canonical and backward compatible', () => {
    expect(buildVoicePersonaPrompt().length).toBeLessThanOrEqual(12500);
    const format = voiceOutputFormat(2);
    expect(format).toContain('"use":"recall","facts":[0]');
    expect(format).toContain('"use":"context","facts":[0]');
    expect(format).not.toContain('memory:[0]');
    expect(MemoryResponseUseSchema.parse([0])).toEqual({
      use: 'recall',
      facts: [0],
    });
    expect(
      MemoryResponseUseSchema.parse({ use: 'context', facts: [1] }),
    ).toEqual({ use: 'context', facts: [1] });
  });
});
