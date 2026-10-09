import { describe, expect, it } from 'vitest';
// @ts-expect-error Evaluator scripts execute as native ESM without TS declarations.
import * as calibration from '../../scripts/lib/jev-calibration.mjs';

const {
  parseReview,
  verifyPairs,
  blindState,
  preferenceAgreement,
  remapPreference,
  criterionAgreement,
} = calibration;

function fixture(id = 'abcdef123456', preference = 'A') {
  return `## Item 1 — ${id}
**Fala atual:** Oi.
**Fatos fornecidos:**
Gosta de puzzles.
### A
**Histórico desta opção:**
Primeiro turno.
**Resposta a avaliar:** Oi.
OBS: prefere uma pausa.
### B
**Histórico desta opção:**
Primeiro turno.
**Resposta a avaliar:** Bom dia.
**Sua avaliação:**
- Preferência: ${preference}
- A aceitável: sim
- B aceitável: incerto
${['Interlocução', 'Proporcionalidade', 'Sustentação factual', 'Continuidade', 'Persona', 'Perguntas', 'Gatilho, alvo, intensidade e recomposição', 'Expressividade'].map((name) => `- ${name} — A: aprova; B: incerto`).join('\n')}
- Motivo: A é pertinente.`;
}

describe('pairwise calibration import', () => {
  it('preserves annotations while hiding labels, comments and reasons from judge', () => {
    const item = parseReview(fixture())[0];
    expect(item.annotations).toEqual(['OBS: prefere uma pausa.']);
    expect(item.review.preference).toBe('A');
    const state = blindState(item);
    expect(state.sharedFacts).toContain('puzzles');
    expect(JSON.stringify(state)).not.toMatch(
      /OBS|pertinente|aprova|preferência/iu,
    );
    expect(blindState(item, true).options.A.reply).toBe('Bom dia.');
    expect(remapPreference('B', true)).toBe('A');
    expect(remapPreference('empate', true)).toBe('empate');
  });

  it('rejects unknown IDs, changed context and unreviewed placeholders', () => {
    const original = parseReview(fixture());
    const mapping = { items: [{ id: 'abcdef123456', item: 1 }] };
    expect(() =>
      verifyPairs(parseReview(fixture('aaaaaa123456')), original, mapping),
    ).toThrow();
    expect(() =>
      verifyPairs(
        parseReview(
          fixture().replace('**Fala atual:** Oi.', '**Fala atual:** Tchau.'),
        ),
        original,
        mapping,
      ),
    ).toThrow();
    expect(() =>
      verifyPairs(
        parseReview(fixture('abcdef123456', 'A / B / empate / incerto')),
        original,
        mapping,
      ),
    ).toThrow();
    expect(() => parseReview(fixture() + '\n' + fixture())).toThrow();
  });

  it('counts ties and judge abstention without turning uncertain owner labels into approval', () => {
    const items = [
      parseReview(fixture())[0],
      parseReview(fixture('aaaaaa123456', 'empate'))[0],
      parseReview(fixture('bbbbbb123456', 'incerto'))[0],
    ];
    expect(
      preferenceAgreement(items, [
        { id: 'abcdef123456', preference: 'incerto' },
        { id: 'aaaaaa123456', preference: 'empate' },
      ]),
    ).toEqual({
      compared: 2,
      matches: 1,
      accuracy: 0.5,
      exclusions: ['bbbbbb123456'],
    });
    expect(preferenceAgreement(items, [], ['abcdef123456']).compared).toBe(0);
  });

  it('measures false approvals separately from uncertain human labels and missing calls', () => {
    const item = parseReview(
      fixture().replace(
        '- Persona — A: aprova; B: incerto',
        '- Persona — A: reprova; B: incerto',
      ),
    )[0];
    const result = criterionAgreement(
      [item],
      [
        {
          group: 'owner',
          itemId: item.id,
          answers: {
            persona_A: { choice: 'sim', confidence: 0.9 },
            persona_B: { choice: 'sim', confidence: 0.95 },
          },
        },
      ],
      'persona',
    );
    expect(result.falseApprovals).toBe(1);
    expect(result.falseApprovalRate).toBe(1);
    expect(result.ownerUncertain).toBe(1);
    expect(result.highConfidenceCompared).toBe(1);
    expect(result.highConfidenceCorrect).toBe(0);
    expect(
      criterionAgreement([item], [], 'persona').falseApprovalRate,
    ).toBeNull();
  });
  it('excludes unanswered sheets instead of treating their design intent as a human label', () => {
    const item = { ...parseReview(fixture())[0], review: null };
    expect(
      preferenceAgreement([item], [{ id: item.id, preference: 'A' }]),
    ).toEqual({
      compared: 0,
      matches: 0,
      accuracy: null,
      exclusions: [item.id],
    });
    expect(criterionAgreement([item], [], 'persona').compared).toBe(0);
  });
});
