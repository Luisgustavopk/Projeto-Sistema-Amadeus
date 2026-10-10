import { describe, expect, it } from 'vitest';
// @ts-expect-error Evaluation CLI helper has no declaration file.
import * as helpers from '../../scripts/lib/acting-jev.mjs';

describe('acting judge inputs', () => {
  it('includes every sample and turn in the full review without merging identical replies', () => {
    const cases = [1, 2].flatMap((sample) =>
      ['before', 'after'].map((arm) => ({
        key: `scenario:${sample}`,
        id: 'scenario',
        split: 'reserved',
        sample,
        arm,
        complete: true,
        turns: [
          { user: 'Primeira fala.', assistant: 'Mesma resposta.' },
          { user: 'Segunda fala.', assistant: 'Outra resposta.' },
        ],
      })),
    );
    const full = helpers.freshPairs({ cases }, null);
    expect(helpers.freshPairs({ cases })).toHaveLength(2);
    expect(full).toHaveLength(4);
    expect(new Set(full.map((pair: { id: string }) => pair.id)).size).toBe(4);
    expect(
      full.filter((pair: { sample: number }) => pair.sample === 2),
    ).toHaveLength(2);

    for (const pair of full.filter(
      (pair: { turn: number }) => pair.turn === 2,
    )) {
      expect(pair.options.A.context).toContain('Primeira fala.');
      expect(pair.options.B.context).toContain('Mesma resposta.');
    }
  });
  it('flags preference contradictions without relabeling either approval or preference', () => {
    const answers = {
      preference: { choice: 'A', confidence: 0.8 },
      acceptable_A: { choice: 'nao', confidence: 0.9 },
      acceptable_B: { choice: 'nao', confidence: 0.9 },
    };
    const original = JSON.stringify(answers);
    expect(helpers.decisionConflicts(answers).conflicts).toContain(
      'both-rejected-but-winner-chosen',
    );
    expect(JSON.stringify(answers)).toBe(original);
    expect(
      helpers.decisionConflicts({
        ...answers,
        preference: { choice: 'nenhuma', confidence: 0.8 },
      }).requiresReview,
    ).toBe(false);
    expect(
      helpers.decisionConflicts({
        ...answers,
        acceptable_A: { choice: 'nao', confidence: 0.6 },
        acceptable_B: { choice: 'nao', confidence: 0.6 },
      }).requiresReview,
    ).toBe(false);
  });
  it('keeps model labels and editorial answers outside the blind request, including inversion', () => {
    const item = {
      id: 'private',
      current: 'Uma fala.',
      scenario: 'V01',
      preference: 'nenhuma',
      review: { preference: 'A' },
      privateMapping: { A: 'before', B: 'after' },
      options: {
        A: { context: 'Antes.', reply: 'Fala A.', secretLabel: 'author-label' },
        B: { context: 'Depois.', reply: 'Fala B.' },
      },
    };
    const payload = helpers.payloadFor(
      item,
      helpers.questionsFor('Rubrica constante.'),
      true,
    );
    expect(payload.state).toEqual({
      currentUserText: 'Uma fala.',
      sharedFacts: '',
      options: {
        A: item.options.B,
        B: { context: 'Antes.', reply: 'Fala A.' },
      },
    });
    expect(JSON.stringify(payload)).not.toContain('privateMapping');
    expect(JSON.stringify(payload)).not.toContain('V01');
    expect(JSON.stringify(payload)).not.toContain('author-label');
    expect(payload.questions.preference.criteria).toHaveProperty('empate');
    expect(payload.questions.preference.criteria).toHaveProperty('nenhuma');
    expect(payload.questions.expressivity_A.criteria).toHaveProperty('incerto');
  });
  it('rejects missing questions, invalid probability distributions and model substitution', () => {
    const questions = {
      test: { type: 'choice', criteria: { A: 'A', B: 'B' } },
    };
    const valid = {
      model: 'typesafe/jev-1.13',
      answers: {
        test: {
          type: 'choice',
          choice: 'A',
          confidence: 0.6,
          probabilities: { A: 0.6, B: 0.4 },
        },
      },
    };
    expect(helpers.validateDecision(valid, questions)).toEqual(valid.answers);
    expect(() =>
      helpers.validateDecision(
        { ...valid, model: 'some-other-model' },
        questions,
      ),
    ).toThrow('MODEL_MISMATCH');
    expect(() =>
      helpers.validateDecision({ ...valid, answers: {} }, questions),
    ).toThrow('QUESTIONS_MISMATCH');
    expect(() =>
      helpers.validateDecision(
        {
          ...valid,
          answers: {
            test: { ...valid.answers.test, probabilities: { A: 1, B: 1 } },
          },
        },
        questions,
      ),
    ).toThrow('INVALID_DECISION');
  });
});
