import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openSharedEvaluationRound } from '../../src/evaluation/persona/shared-round.ts';

describe('aggregate budget for authors and judges', () => {
  it('retains unknown charges across tasks, rejects budget changes and excludes concurrency', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'amadeus-v21-test-'));
    const directory = pathToFileURL(folder + sep);

    try {
      const author = await openSharedEvaluationRound(
        directory,
        0.25,
        'manifest',
      );
      await expect(
        openSharedEvaluationRound(directory, 0.25, 'manifest'),
      ).rejects.toThrow();
      author.budget.reserve('author', [], 10, { prompt: 1, completion: 1 });
      author.budget.settle('author', null);
      await author.persist(new URL('author.json', directory), {});
      const spent = author.snapshot().roundCommittedUsd;
      await author.close();
      await expect(
        openSharedEvaluationRound(directory, 0.5, 'manifest'),
      ).rejects.toThrow('congelada');
      await expect(
        openSharedEvaluationRound(directory, 0.25, 'other-manifest'),
      ).rejects.toThrow('congelada');
      const judge = await openSharedEvaluationRound(
        directory,
        0.25,
        'manifest',
      );
      expect(judge.snapshot().priorCommittedUsd).toBe(spent);
      judge.budget.reserve('judge', [], 10, { prompt: 1, completion: 1 });
      judge.budget.settle('judge', 0.00001);
      await judge.persist(new URL('judge.json', directory), {});
      expect(
        JSON.parse(
          await readFile(
            new URL('quality-v2-1-budget.json', directory),
            'utf8',
          ),
        ).committedUsd,
      ).toBeCloseTo(spent + 0.00001);
      await judge.close();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
