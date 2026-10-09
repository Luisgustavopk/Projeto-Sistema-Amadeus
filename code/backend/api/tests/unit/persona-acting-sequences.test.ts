import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShotBankSchema } from '../../src/evaluation/persona/experimental-suite.ts';
import { buildRefinementMessages } from '../../src/evaluation/persona/refinement-v3.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../../src/application/persona/presence-reference.ts';
import {
  buildVoicePersonaCore,
  voiceOutputFormat,
} from '../../src/application/persona/voice-prompt.ts';

const root = new URL('../../../evals/persona/', import.meta.url);
const before = ShotBankSchema.parse(
  JSON.parse(readFileSync(new URL('quality-v2.1/shots.json', root), 'utf8')),
);
const after = ShotBankSchema.parse(
  JSON.parse(
    readFileSync(new URL('quality-v7/shots-sequences.json', root), 'utf8'),
  ),
);
const suite = JSON.parse(
  readFileSync(new URL('quality-v7/conversations.json', root), 'utf8'),
) as { development: { turns: string[] }[]; reserved: { turns: string[] }[] };
describe('acting sequences isolated experiment', () => {
  it('changes only demonstrations; preserves system, user turn and real history', () => {
    const originalCore = buildVoicePersonaCore(true, false);
    const input = {
      variant: 'acting' as const,
      originalCore,
      card: 'Ficha constante.',
      direction: 'Direção constante.',
      presence: 'Presença constante.',
      system: originalCore + PERSONA_PRESENCE_REFERENCE + voiceOutputFormat(),
      history: [
        { role: 'user', content: 'Une observation différente.' },
        { role: 'assistant', content: 'Une réponse.' },
      ],
      content: 'A new question.',
      memoryBlock: '',
      canonicalMemory: true,
    };
    const selected = (bank: typeof before) => ({
      ...bank,
      levels: { ...bank.levels, '1': ['estilo-apelido'] },
    });
    const a = buildRefinementMessages({ ...input, bank: selected(before) });
    const b = buildRefinementMessages({ ...input, bank: selected(after) });
    expect(a[0]).toEqual(b[0]);
    expect(a.slice(-3)).toEqual(b.slice(-3));
    expect(a.slice(1, -3)).not.toEqual(b.slice(1, -3));
    expect(b[0]?.content).not.toContain('Reage ao apelido deliberado');
  });
  it('preserves source identity and has no demonstration memories', () => {
    expect(after.levels).toEqual(before.levels);

    for (const shot of after.shots) {
      const old = before.shots.find((s) => s.id === shot.id);
      expect(shot.sourceIds).toEqual(old?.sourceIds);

      if (shot.kind === 'style-adaptation') {
        expect(shot.facts).toEqual([]);
      }
    }

    const sequence = after.shots.find((s) => s.id === 'estilo-apelido')!;
    const labels = sequence.messages
      .filter((m) => m.role === 'assistant')
      .map((m) =>
        JSON.parse(m.content.match(/<expression>(.*?)<\/expression>/u)![1]!),
      );
    expect(labels[1].intensity).toBeGreaterThan(labels[0].intensity);
    expect(labels[2].intensity).toBeLessThan(labels[1].intensity);
  });
  it('uses fresh literal turns separate from examples and separate reserved conversations', () => {
    const prompts = new Set(
      [...before.shots, ...after.shots]
        .flatMap((s) => s.messages)
        .map((m) => m.content.toLocaleLowerCase()),
    );
    const development = new Set(suite.development.flatMap((s) => s.turns));

    for (const scenario of [...suite.development, ...suite.reserved]) {
      for (const turn of scenario.turns) {
        expect(prompts.has(turn.toLocaleLowerCase())).toBe(false);
      }
    }

    for (const scenario of suite.reserved) {
      for (const turn of scenario.turns) {
        expect(development.has(turn)).toBe(false);
      }
    }
  });
});
