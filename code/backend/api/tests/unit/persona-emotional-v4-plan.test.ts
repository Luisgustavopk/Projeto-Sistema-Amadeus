import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareEmotionalSuite } from '../../src/evaluation/persona/emotional-suite.ts';
import { planEmotionalV4 } from '../../src/evaluation/persona/emotional-v4-plan.ts';

const suite = JSON.parse(
  readFileSync(
    new URL(
      '../../../evals/persona/quality-v4/emotional-pt-BR.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('fixed Llama emotional experiment', () => {
  it('covers all approved conversations and balances repeated arms', () => {
    const prepared = prepareEmotionalSuite(suite, []);
    const plan = planEmotionalV4(prepared);
    expect(plan.plannedTurns).toBe(296);
    expect(plan.jobs).toHaveLength(74);
    expect(new Set(plan.jobs.map((job) => job.scenario.id)).size).toBe(24);

    for (const id of plan.pairedScenarios) {
      const jobs = plan.jobs.filter((job) => job.scenario.id === id);
      expect(jobs.filter((job) => job.variant === 'before')).toHaveLength(3);
      expect(jobs.filter((job) => job.variant === 'after')).toHaveLength(3);
      expect(jobs.map((job) => job.sample).sort()).toEqual([1, 1, 2, 2, 3, 3]);
    }

    expect(plan.jobs.filter((job) => job.phase === 'coverage')).toHaveLength(
      14,
    );
    expect(plan.isolatedFactor).toBe('expressiveDirection');
  });
});
