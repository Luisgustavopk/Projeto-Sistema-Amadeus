import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { judgeCriteria } from '../../src/evaluation/persona/judge.ts';

describe('local calibration reports', () => {
  it('preserves human labels across summarization and measures false approval without remote calls', async () => {
    const apiRoot = new URL('../../', import.meta.url);
    const directory = new URL('data/refinement/', apiRoot);
    await mkdir(directory, { recursive: true });
    const name = `${Date.now()}${process.pid}-quality-v2`;
    const path = new URL(`${name}.json`, directory);
    const labelPath = new URL(`${name}-calibration.json`, directory);
    const checks = Object.fromEntries(
      judgeCriteria.map((key) => [
        key,
        { applicable: true, pass: true, evidence: 'Fixture.' },
      ]),
    );
    const report = {
      createdAt: '2026-10-07T00:00:00.000Z',
      split: 'heldout',
      plannedTurns: 1,
      models: ['llama'],
      variants: ['compact'],
      limitations: [],
      budget: { roundMaxUsd: 0.25, roundCommittedUsd: 0 },
      calls: [],
      cases: [
        {
          id: 'H01',
          model: 'llama',
          variant: 'compact',
          sample: 1,
          expectation: 'Fixture sintética.',
          turns: [
            {
              user: 'oi',
              assistant: 'Oi.',
              facts: [],
              history: [],
              errors: [],
              totalMs: 1,
              verdict: { checks, summary: 'Fixture.' },
            },
          ],
        },
      ],
    };
    const run = (script: string) =>
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL(`scripts/${script}`, apiRoot)), `${name}.json`],
        { cwd: fileURLToPath(apiRoot), encoding: 'utf8' },
      );

    try {
      await writeFile(path, JSON.stringify(report));
      run('summarize-conversation-quality.mjs');
      const labels = JSON.parse(await readFile(labelPath, 'utf8')) as {
        turns: { humanChecks: typeof checks | null }[];
      };
      labels.turns[0]!.humanChecks = Object.fromEntries(
        judgeCriteria.map((key) => [
          key,
          { applicable: true, pass: false, evidence: 'Revisão sintética.' },
        ]),
      );
      await writeFile(labelPath, JSON.stringify(labels));
      run('summarize-conversation-quality.mjs');
      expect(JSON.parse(await readFile(labelPath, 'utf8'))).toEqual(labels);
      const result = JSON.parse(run('calibrate-conversation-quality.mjs')) as {
        reviewed: number;
        calibrationComplete: boolean;
        agreement: { persona: { falseApproval: number } };
      };
      expect(result.reviewed).toBe(1);
      expect(result.calibrationComplete).toBe(false);
      expect(result.agreement.persona.falseApproval).toBe(1);
    } finally {
      for (const suffix of [
        '.json',
        '.md',
        '-calibration.json',
        '-calibration.md',
        '-agreement.json',
      ]) {
        await unlink(new URL(name + suffix, directory)).catch(() => {});
      }
    }
  });
});
