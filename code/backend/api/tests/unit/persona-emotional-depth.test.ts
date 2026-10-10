import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareEmotionalDepth } from '../../src/evaluation/persona/emotional-depth.ts';

const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL('../../../evals/persona/' + path, import.meta.url),
      'utf8',
    ),
  );
const depth = read('quality-v5/emotional-depth-pt-BR.json');
const old = read('quality-v4/emotional-pt-BR.json');
describe('approved depth evaluation boundaries', () => {
  it('keeps variable approved lengths, seeded history and initiative, without leaking rubric', () => {
    const prepared = prepareEmotionalDepth(depth, old, []);
    expect(
      prepared.authorCases.reduce((sum, c) => sum + c.turns.length, 0),
    ).toBe(238);
    expect(
      prepared.authorCases.find((c) => c.id === 'PBR47')?.turns,
    ).toHaveLength(4);
    expect(
      prepared.authorCases.find((c) => c.id === 'PBR48')?.turns[4],
    ).toEqual({ initiativeKind: 'initiative' });
    expect(
      prepared.authorCases.find((c) => c.id === 'PBR29')?.history?.[0]
        ?.sentText,
    ).toBe('É quinze.');

    for (const scenario of prepared.authorCases) {
      expect(Object.keys(scenario).sort()).toEqual(
        (scenario.history
          ? ['domain', 'facts', 'history', 'id', 'turns']
          : ['domain', 'facts', 'id', 'turns']
        ).sort(),
      );
    }

    expect(prepared.testsAudioOrPresenceScheduler).toBe(false);
  });
  it('rejects unapproved input and accidental additions to the four-turn exception', () => {
    expect(() =>
      prepareEmotionalDepth(
        { ...depth, status: 'awaiting-user-validation' },
        old,
        [],
      ),
    ).toThrow();
    const changed = structuredClone(depth);
    changed.cases
      .find((c: { id: string }) => c.id === 'PBR47')
      .turns.push('Uma fala que não foi aprovada.');
    expect(() => prepareEmotionalDepth(changed, old, [])).toThrow('divergente');
    expect(() =>
      prepareEmotionalDepth(depth, old, [depth.cases[0].turns[0]]),
    ).toThrow('sobreposto');
  });
});
