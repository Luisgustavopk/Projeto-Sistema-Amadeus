import { describe, expect, it } from 'vitest';
import { buildPresenceDirection } from '../../src/application/persona/presence-direction.ts';
import type { StoredTurn } from '../../src/ports/call-history-repository.ts';

const turn = (userText: string): StoredTurn => ({
  userText,
  generatedText: '',
  sentText: 'A textual reply.',
  dataClass: 'synthetic',
  responseStatus: 'completed',
});
const anchor = (direction: string) =>
  JSON.parse(
    direction.match(/<presence_anchor>\n(.*?)\n<\/presence_anchor>/su)![1]!,
  );

describe('initiative uses conversation evidence, not fixed examples', () => {
  it('uses a bounded window of real user turns in any language and distinguishes sent text', () => {
    const history = [
      turn('Older topic'),
      turn('I am writing a story about a strange radio.'),
      { ...turn('Not a user turn'), initiativeKind: 'initiative' as const },
      turn('El lector aún no sabe la regla.'),
      turn('A revelação acontece depois.'),
    ];
    const direction = buildPresenceDirection('initiative', history);
    const evidence = anchor(direction);
    expect(evidence.turns.map((entry: { user: string }) => entry.user)).toEqual(
      [history[1]!.userText, history[3]!.userText, history[4]!.userText],
    );
    expect(evidence.turns[0]).toMatchObject({
      assistantConfirmed: '',
      assistantSent: 'A textual reply.',
    });
    expect(evidence.doesNotProveReadingOrHearing).toBe(true);
    expect(direction).not.toContain('apresentação do projeto');
    expect(direction).not.toContain('Meu puzzle');
  });
  it('bounds long messages and leaves absent evidence absent', () => {
    const direction = buildPresenceDirection('initiative', [
      turn('x '.repeat(5000)),
    ]);
    expect(JSON.stringify(anchor(direction).turns).length).toBeLessThanOrEqual(
      1202,
    );
    expect(anchor(buildPresenceDirection('initiative')).turns).toEqual([]);
    expect(
      buildPresenceDirection('greeting', [turn('Private topic')]),
    ).not.toContain('Private topic');
    expect(buildPresenceDirection('greeting')).not.toContain(
      '<presence_anchor>',
    );
  });
});
