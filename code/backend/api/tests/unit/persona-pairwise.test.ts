import { describe, expect, it } from 'vitest';
import {
  calibrationAgreement,
  judgeCriteria,
  parseVerdict,
} from '../../src/evaluation/persona/judge.ts';
import {
  pairwiseSummary,
  stablePairwiseDecision,
} from '../../src/evaluation/persona/pairwise.ts';

describe('blind comparison with swapped order', () => {
  it('measures false approvals among human failures and keeps missing negatives unknown', () => {
    const verdict = (pass: boolean) =>
      parseVerdict(
        JSON.stringify({
          checks: Object.fromEntries(
            judgeCriteria.map((k) => [
              k,
              { applicable: true, pass, evidence: 'Calibration evidence' },
            ]),
          ),
          summary: '',
        }),
      );
    const result = calibrationAgreement([
      { automatic: verdict(true), human: verdict(false) },
      { automatic: verdict(false), human: verdict(false) },
    ]);
    expect(result.persona).toMatchObject({
      humanFailures: 2,
      falseApproval: 1,
      falseApprovalRate: 0.5,
    });
    expect(
      calibrationAgreement([{ automatic: verdict(true), human: verdict(true) }])
        .persona?.falseApprovalRate,
    ).toBeNull();
  });
  it('inverts labels, keeps order disagreement unknown and distinguishes rejection', () => {
    const verdict = {
      winner: 'A' as const,
      bothAcceptable: false,
      evidence: 'Both weak.',
    };
    expect(
      stablePairwiseDecision(verdict, { ...verdict, winner: 'B' }),
    ).toMatchObject({ winner: 'A', bothAcceptable: false });
    expect(stablePairwiseDecision(verdict, verdict).winner).toBe('uncertain');
    expect(stablePairwiseDecision(verdict, null).winner).toBe('uncertain');
    expect(
      stablePairwiseDecision(
        { ...verdict, winner: 'tie' },
        { ...verdict, winner: 'tie' },
      ).winner,
    ).toBe('tie');
  });
  it('resamples scenario clusters rather than pretending turns are independent', () => {
    const items = [
      { scenario: 'one', sample: 1, winner: 'B', bothAcceptable: false },
      { scenario: 'two', sample: 1, winner: 'A', bothAcceptable: true },
    ];
    const result = pairwiseSummary(items);
    const repeated = pairwiseSummary([
      ...items,
      ...Array.from({ length: 50 }, () => items[0]!),
    ]);
    expect(result.bPreference).toBe(0.5);
    expect(repeated.confidence95).toEqual(result.confidence95);
    expect(result.approved).toBe(false);
    expect(result.notBothAcceptable).toBe(1);
    expect(result.exploratory).toBe(true);
    expect(
      pairwiseSummary([{ ...items[0]!, winner: 'uncertain' }]).confidence95,
    ).toBeNull();
  });
});
