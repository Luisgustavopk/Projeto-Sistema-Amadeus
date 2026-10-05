import { expect, it } from 'vitest';
import { reviewPersonaReport } from '../../src/domain/persona/review.ts';

function report() {
  return {
    results: Array.from({ length: 30 }, (_, index) => ({
      id: `P${String(index + 1).padStart(2, '0')}`,
      errorCode: null,
      scores: {
        fidelity: 4,
        naturalness: 4,
        consistency: 4,
        emotion: 4,
        memory: 4,
        speakability: 4,
        honesty: 4,
        identity: 4,
      },
      disqualifications: [] as string[],
    })),
    voiceReview: { meanQuality: 4, intentRecognitionRate: 0.8 },
  };
}

it('aprova somente 30 cenários revisados e gate vocal completo', () => {
  expect(reviewPersonaReport(report()).status).toBe('passed');
  expect(reviewPersonaReport({ ...report(), voiceReview: null }).status).toBe(
    'pending',
  );
  expect(
    reviewPersonaReport({ ...report(), results: report().results.slice(0, 29) })
      .status,
  ).toBe('pending');
});

it('aceite vocal explícito do usuário dispensa notas vocais sem dispensar revisão textual', () => {
  const voiceAcceptance = {
    source: 'user',
    approved: true,
    approvedAt: '2026-10-05T03:00:00.000Z',
    reason: 'O usuário aprovou a qualidade vocal atual.',
  };
  expect(
    reviewPersonaReport({ ...report(), voiceReview: null, voiceAcceptance })
      .status,
  ).toBe('passed');
  expect(
    reviewPersonaReport({
      ...report(),
      results: [],
      voiceReview: null,
      voiceAcceptance,
    }).status,
  ).toBe('pending');
});

it('uma nota ausente ou erro de provedor mantém o aceite pendente', () => {
  const value = report();
  expect(
    reviewPersonaReport({
      ...value,
      results: [
        { ...value.results[0], scores: null },
        ...value.results.slice(1),
      ],
    }).status,
  ).toBe('pending');
  expect(
    reviewPersonaReport({
      ...value,
      results: [
        { ...value.results[0], errorCode: 'QUOTA_EXCEEDED' },
        ...value.results.slice(1),
      ],
    }).status,
  ).toBe('pending');
});

it('rejeita desqualificação ou reconhecimento vocal abaixo de 80%', () => {
  const value = report();
  value.results[0]!.disqualifications.push('Inventou dia no laboratório');
  expect(reviewPersonaReport(value).status).toBe('rejected');
  expect(
    reviewPersonaReport({
      ...report(),
      voiceReview: { meanQuality: 4, intentRecognitionRate: 0.79 },
    }).status,
  ).toBe('rejected');
});

it('não aceita notas fora da escala ou IDs duplicados', () => {
  const value = report();
  value.results[0]!.scores.fidelity = 6;
  expect(() => reviewPersonaReport(value)).toThrow();
  const repeated = report();
  repeated.results[1]!.id = 'P01';
  expect(() => reviewPersonaReport(repeated)).toThrow();
});
