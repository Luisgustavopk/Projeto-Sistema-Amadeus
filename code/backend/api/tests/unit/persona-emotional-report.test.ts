import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
// @ts-expect-error Offline JavaScript evaluator has no declaration file.
import { summarizeThreeModelV3 } from '../../scripts/lib/three-model-v3-report.mjs';

it('includes the fourth turn in blind review and excludes incomplete conversations from matched metrics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'amadeus-emotional-'));
  const models = ['llama', 'deepseek', 'qwen'].map((name) => ({
    name,
    id: name,
  }));
  const turn = () => ({
    assistant: 'Resposta de teste local.',
    user: 'Fala sintética.',
    errors: [],
    facts: [],
    history: [],
    inputs: [{ hash: 'same' }],
    diagnostics: { words: 4, questions: 0, exampleCopy: { matched: [] } },
  });
  const report = {
    plan: {
      fingerprint: 'test',
      plannedTurns: 24,
      frozen: {
        scope: 'Synthetic local test',
        models,
        jobs: ['PBR01', 'PBR02'].map((id) => ({
          scenario: { id, turns: ['a', 'b', 'c', 'd'] },
        })),
      },
    },
    calls: [],
    budget: { roundMaxUsd: 0.25, roundCommittedUsd: 0 },
    cases: models.flatMap((model) =>
      ['PBR01', 'PBR02'].map((id) => ({
        id,
        model: model.name,
        variant: 'acting',
        turns: Array.from(
          { length: id === 'PBR02' && model.name === 'qwen' ? 3 : 4 },
          turn,
        ),
      })),
    ),
  };

  try {
    const path = pathToFileURL(join(directory, 'local.json'));
    const summary = await summarizeThreeModelV3(path, report);
    expect(summary.commonCompleteScenarios).toEqual(['PBR01']);
    const review = JSON.parse(
      await readFile(join(directory, 'local-review-private.json'), 'utf8'),
    );
    expect(review.items).toHaveLength(4);
    expect(review.items.at(-1).turn).toBe(4);
    expect(
      summary.models.find((model: { model: string }) => model.model === 'qwen')
        .completeConversations,
    ).toBe(1);
  } finally {
    expect(resolve(dirname(directory))).toBe(resolve(tmpdir()));
    expect(basename(directory)).toMatch(/^amadeus-emotional-/u);
    await rm(directory, { recursive: true, force: true });
  }
});
