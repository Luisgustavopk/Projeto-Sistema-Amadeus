import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
// @ts-expect-error Offline JavaScript evaluator has no declaration file.
import { summarizeLlamaEmotionalV4 } from '../../scripts/lib/llama-emotional-v4-report.mjs';

it('keeps blind pairs complete and separates coverage and inherited spending', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'amadeus-llama-v4-'));
  const factor = 'Expressive factor';
  const turn = (variant: string, index: number) => ({
    user: 'A synthetic turn.',
    assistant: variant + ' reply ' + index,
    errors: [],
    facts: [],
    history: [],
    callIds: [],
    inputs: [
      {
        messages: [
          {
            role: 'system',
            content:
              'Core' +
              (variant === 'after'
                ? '\n<persona_expressive_direction>\n' +
                  factor +
                  '\n</persona_expressive_direction>'
                : ''),
          },
        ],
      },
    ],
    diagnostics: { words: 4, questions: 0, sentences: 1 },
  });
  const report = {
    completedAt: new Date().toISOString(),
    plan: {
      fingerprint: 'local',
      plannedTurns: 20,
      frozen: {
        scope: 'Local test',
        expressiveDirection: factor,
        design: { pairedScenarios: ['PBR01', 'PBR02'] },
      },
    },
    calls: [],
    budget: {
      roundMaxUsd: 0.25,
      roundCommittedUsd: 0.1,
      priorCommittedUsd: 0.1,
    },
    cases: ['PBR01', 'PBR02']
      .flatMap((id) =>
        ['before', 'after'].map((variant) => ({
          id,
          model: 'llama',
          variant,
          phase: 'comparison',
          sample: 1,
          turns: Array.from(
            { length: id === 'PBR02' && variant === 'after' ? 3 : 4 },
            (_, index) => turn(variant, index),
          ),
        })),
      )
      .concat([
        {
          id: 'PBR03',
          model: 'llama',
          variant: 'after',
          phase: 'coverage',
          sample: 1,
          turns: Array.from({ length: 4 }, (_, index) => turn('after', index)),
        },
      ]),
  };

  try {
    const summary = await summarizeLlamaEmotionalV4(
      pathToFileURL(join(folder, 'local.json')),
      report,
    );
    expect(summary.pairedConversationsPerArm).toBe(1);
    expect(summary.comparison.before.allAttempts.attemptedTurns).toBe(8);
    expect(summary.comparison.after.matchedComplete.attemptedTurns).toBe(4);
    expect(summary.candidateCoverage.attemptedTurns).toBe(4);
    expect(summary.newReportedUsd).toBe(0);
    expect(summary.totalCommittedUsd).toBe(0.1);
    expect(summary.remainingUsd).toBeCloseTo(0.15);
    expect(
      summary.firstInputComparisons.every(
        (entry: { equivalentExceptExpressiveDirection: boolean }) =>
          entry.equivalentExceptExpressiveDirection,
      ),
    ).toBe(true);
    const review = JSON.parse(
      await readFile(join(folder, 'local-review.json'), 'utf8'),
    );
    expect(review.items).toHaveLength(4);
    expect(
      review.items.every(
        (item: { humanChecks: unknown }) => item.humanChecks === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(review)).not.toContain('"variant"');
    expect(JSON.stringify(review)).not.toContain('"sample"');
    const mappings = JSON.parse(
      await readFile(join(folder, 'local-pairs-private.json'), 'utf8'),
    );
    expect(mappings.some((item: { turn: number }) => item.turn === 4)).toBe(
      true,
    );
  } finally {
    expect(resolve(dirname(folder))).toBe(resolve(tmpdir()));
    expect(basename(folder)).toMatch(/^amadeus-llama-v4-/u);
    await rm(folder, { recursive: true, force: true });
  }
});
