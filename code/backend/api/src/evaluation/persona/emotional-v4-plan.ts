import type { prepareEmotionalSuite } from './emotional-suite.ts';

// Evaluation IDs select experimental coverage; no user-language classifier.
export const repeatedEmotionalCases = [
  'PBR02',
  'PBR03',
  'PBR04',
  'PBR06',
  'PBR09',
  'PBR10',
  'PBR13',
  'PBR16',
  'PBR22',
  'PBR23',
] as const;

export function planEmotionalV4(
  prepared: ReturnType<typeof prepareEmotionalSuite>,
) {
  const find = (id: string) => {
    const scenario = prepared.authorCases.find((entry) => entry.id === id);

    if (!scenario) {
      throw new Error('Cenário experimental ausente: ' + id);
    }

    return scenario;
  };

  const jobs = [];

  for (let sample = 1; sample <= 3; sample++) {
    for (const [index, id] of repeatedEmotionalCases.entries()) {
      const variants =
        (sample + index) % 2
          ? (['before', 'after'] as const)
          : (['after', 'before'] as const);

      for (const variant of variants) {
        jobs.push({ phase: 'comparison', scenario: find(id), variant, sample });
      }
    }
  }

  for (const scenario of prepared.authorCases) {
    if (!repeatedEmotionalCases.some((id) => id === scenario.id)) {
      jobs.push({
        phase: 'coverage',
        scenario,
        variant: 'after' as const,
        sample: 1,
      });
    }
  }

  return {
    jobs,
    pairedScenarios: [...repeatedEmotionalCases],
    samplesPerComparedScenario: 3,
    comparedTurnsPerArm: 120,
    coverageTurns: 56,
    plannedTurns: jobs.reduce((sum, job) => sum + job.scenario.turns.length, 0),
    isolatedFactor: 'expressiveDirection',
    commonCorrection: 'presence-anchor-v2',
    audio: false,
  };
}
