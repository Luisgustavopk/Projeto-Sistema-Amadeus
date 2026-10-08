import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ShotBankSchema,
  buildExperimentalMessages,
} from '../../src/evaluation/persona/experimental-suite.ts';
import {
  buildRefinementMessages,
  recordVerdict,
  requireHumanReference,
} from '../../src/evaluation/persona/refinement-v3.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../../src/application/persona/presence-reference.ts';
import { voiceOutputFormat } from '../../src/application/persona/voice-prompt.ts';

const bank = ShotBankSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../evals/persona/quality-v2.1/shots.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const input = {
  originalCore: 'core',
  card: 'card',
  direction: 'direction',
  presence: 'positive acting',
  system: 'core\n' + PERSONA_PRESENCE_REFERENCE + voiceOutputFormat(0),
  history: [{ role: 'user', content: 'A real conversation.' }],
  content: 'Current turn',
  bank,
  memoryBlock: '',
};

describe('persona refinement v3 factors', () => {
  it('preserves the historical baseline exactly', () => {
    expect(buildRefinementMessages({ ...input, variant: 'baseline' })).toEqual(
      buildExperimentalMessages({
        ...input,
        variant: 'card-shots',
        level: '1',
      }),
    );
  });
  it('removes personal-fact demonstrations by their structural kind, without altering style examples', () => {
    const baseline = buildRefinementMessages({ ...input, variant: 'baseline' });
    const isolated = buildRefinementMessages({ ...input, variant: 'isolated' });
    expect(isolated[0]).toEqual(baseline[0]);

    for (const shot of bank.shots.filter(
      (s) => s.kind === 'style-adaptation' && bank.levels['1']!.includes(s.id),
    )) {
      for (const message of shot.messages) {
        expect(isolated).toContainEqual(message);
      }
    }

    for (const shot of bank.shots.filter(
      (s) => s.kind === 'synthetic-memory-contract',
    )) {
      expect(isolated.some((m) => m.content.includes(shot.facts[0]!))).toBe(
        false,
      );
    }

    expect(isolated.slice(-2)).toEqual(baseline.slice(-2));
  });
  it('changes only the presence direction after isolation', () => {
    const isolated = buildRefinementMessages({ ...input, variant: 'isolated' });
    const acting = buildRefinementMessages({ ...input, variant: 'acting' });
    expect(acting.slice(1)).toEqual(isolated.slice(1));
    expect(acting[0]?.content).not.toContain(PERSONA_PRESENCE_REFERENCE);
    expect(acting[0]?.content).toContain(input.presence);
    expect(acting[0]?.content).toContain(voiceOutputFormat(0));
  });
  it.each([
    'A person prefers astronomy.',
    'La personne préfère la randonnée.',
    'The user likes music, not drawing.',
  ])('relocates arbitrary factual content unchanged: %s', (memoryBlock) => {
    const original = {
      ...input,
      memoryBlock,
      system: input.system + '\n' + memoryBlock,
    };
    const acting = buildRefinementMessages({ ...original, variant: 'acting' });
    const grounded = buildRefinementMessages({
      ...original,
      variant: 'grounded',
    });
    expect(grounded.at(-2)).toEqual({ role: 'system', content: memoryBlock });
    expect(grounded[0]?.content).not.toContain(memoryBlock);
    expect(
      grounded.filter((m) => m.content.includes(memoryBlock)),
    ).toHaveLength(1);
    expect(grounded.at(-1)).toEqual(acting.at(-1));
    expect(grounded.slice(1, -2)).toEqual(acting.slice(1, -1));
  });
  it('blocks missing or duplicated facts and prevents the plain prototype from handling persistent memories', () => {
    expect(() =>
      buildRefinementMessages({
        ...input,
        variant: 'grounded',
        memoryBlock: 'absent',
      }),
    ).toThrow('Bloco factual');
    expect(() =>
      buildRefinementMessages({
        ...input,
        variant: 'grounded',
        memoryBlock: 'fact',
        system: input.system + 'fact fact',
      }),
    ).toThrow('Bloco factual');
    expect(() =>
      buildRefinementMessages({
        ...input,
        variant: 'acting',
        plain: true,
        memoryBlock: 'fact',
      }),
    ).toThrow('não admite fatos');
  });
  it('tests plain speech as an independent output-protocol factor', () => {
    const messages = buildRefinementMessages({
      ...input,
      variant: 'acting',
      plain: true,
    });
    expect(messages[0]?.content).not.toContain(voiceOutputFormat(0));
    expect(
      messages
        .filter((m) => m.role === 'assistant')
        .every((m) => !m.content.includes('<expression>')),
    ).toBe(true);
    expect(messages.at(-1)?.content).toBe(input.content);
  });
  it('never treats model-generated or non-blind labels as human calibration', () => {
    expect(() =>
      requireHumanReference({
        evaluatorKind: 'external-model',
        personallyReviewed: true,
        blind: true,
      }),
    ).toThrow('pendente');
    expect(() =>
      requireHumanReference({
        evaluatorKind: 'human',
        personallyReviewed: true,
        blind: false,
      }),
    ).toThrow('pendente');
    expect(() =>
      requireHumanReference({
        evaluatorKind: 'human',
        personallyReviewed: true,
        blind: true,
      }),
    ).not.toThrow();
  });
  it('preserves malformed raw verdicts before recording a parsing failure', async () => {
    const target = { raw: '', verdict: null, error: null } as {
      raw: string;
      verdict: unknown;
      error: string | null;
    };
    let persisted = false;
    await recordVerdict(
      (async function* () {
        yield '{"broken"';
      })(),
      JSON.parse,
      target,
      async () => {
        persisted = true;
      },
    );
    expect(target.raw).toBe('{"broken"');
    expect(target.error).toBe('SyntaxError');
    expect(target.verdict).toBeNull();
    expect(persisted).toBe(true);
  });
});
