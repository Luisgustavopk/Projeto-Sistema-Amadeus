import {
  preferenceAgreement,
  criterionAgreement,
  remapPreference,
} from './jev-calibration.mjs';
export function summarizeJevV8(reference, controls, report) {
  return {
    knownPreference: preferenceAgreement(
      reference.owner,
      report.calls
        .filter((c) => c.group === 'owner' && c.answers)
        .map((c) => ({
          id: c.itemId,
          preference: c.answers.preference.choice,
        })),
      [...reference.pendingPreferenceIds, 'e429fbad8877'],
    ),
    knownCriteria: Object.fromEntries(
      ['acceptable', 'persona', 'expressivity'].map((k) => [
        k,
        criterionAgreement(reference.owner, report.calls, k),
      ]),
    ),
    extraPreference: preferenceAgreement(
      reference.synthetic,
      report.calls
        .filter((c) => c.group === 'extra' && c.answers)
        .map((c) => ({
          id: c.itemId,
          preference: c.answers.preference.choice,
        })),
    ),
    extraCriteria: Object.fromEntries(
      ['acceptable', 'persona', 'expressivity'].map((k) => [
        k,
        criterionAgreement(
          reference.synthetic,
          report.calls
            .filter((c) => c.group === 'extra')
            .map((c) => ({ ...c, group: 'owner' })),
          k,
        ),
      ]),
    ),
    controls: controls.map((c) => ({
      id: c.id,
      expected: c.preference,
      actual: report.calls.find(
        (t) => t.group === 'control' && t.itemId === c.id,
      )?.answers?.preference?.choice,
    })),
    orderChecks: report.calls
      .filter((c) => c.group === 'order-check' && c.answers)
      .map((c) => ({
        id: c.itemId,
        actual: remapPreference(c.answers.preference.choice, true),
        original: report.calls.find(
          (o) => o.group === 'control' && o.itemId === c.itemId,
        )?.answers?.preference?.choice,
      })),
    contradictions: report.calls
      .filter((c) => c.consistencyAudit?.requiresReview)
      .map((c) => c.id),
    newPairsRequirePersonalReview: true,
  };
}
