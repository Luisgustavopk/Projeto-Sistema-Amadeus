import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildExperimentalMessages,
  parseScenarioDataset,
  ShotBankSchema,
} from '../../src/evaluation/persona/experimental-suite.ts';
import {
  contamination,
  fingerprint,
} from '../../src/evaluation/persona/diagnostics.ts';

const root = new URL('../../../evals/persona/quality-v2.1/', import.meta.url);
const old = new URL('../../../evals/persona/quality-v2/', import.meta.url);
describe('isolated v2.1 experiments', () => {
  it('preserves historical resources, identifies implementation drift and verifies disjoint exemplars', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('manifest.json', root), 'utf8'),
    ) as { files: Record<string, string> };

    const implementationDrift: string[] = [];

    for (const [file, hash] of Object.entries(manifest.files)) {
      const current = fingerprint(await readFile(new URL(file, root), 'utf8'));

      if (file.startsWith('../../../api/') && current !== hash) {
        implementationDrift.push(file);
      } else {
        expect(current).toBe(hash);
      }
    }

    // Do not replace the old hash with the new code's hash to permit inference.
    expect(implementationDrift).toEqual([
      '../../../api/src/evaluation/persona/shared-round.ts',
      '../../../api/src/evaluation/persona/router.ts',
    ]);

    const bank = ShotBankSchema.parse(
      JSON.parse(await readFile(new URL('shots.json', root), 'utf8')),
    );
    expect(bank.levels['1']).toHaveLength(12);
    expect(bank.levels['2']).toHaveLength(19);
    expect(
      bank.shots.filter((s) => s.kind === 'synthetic-memory-contract'),
    ).toHaveLength(2);

    for (const split of [
      'development',
      'heldout',
      'regression',
      'memory',
      'initiative',
    ]) {
      const data = parseScenarioDataset(
        await readFile(new URL(split + '.json', old), 'utf8'),
      );
      expect(
        contamination(
          data.cases,
          bank.shots.flatMap((s) => s.messages.map((m) => m.content)),
        ),
      ).toEqual([]);
    }
  });
  it('retains history and factual/output contracts while changing only each arm', async () => {
    const bank = ShotBankSchema.parse(
      JSON.parse(await readFile(new URL('shots.json', root), 'utf8')),
    );
    const input = {
      originalCore: 'CORE',
      card: 'CARD',
      direction: 'FINAL',
      system: 'CORE\nFACTS\nFORMAT',
      history: [{ role: 'user', content: 'prior' }],
      content: 'now',
      bank,
      level: '1',
    };
    const current = buildExperimentalMessages({ ...input, variant: 'current' });
    const card = buildExperimentalMessages({ ...input, variant: 'card' });
    const shots = buildExperimentalMessages({
      ...input,
      variant: 'card-shots',
    });
    expect(current[0]!.content).toBe('CORE\nFACTS\nFORMAT\nFINAL');
    expect(card[0]!.content).toBe('CARD\nFACTS\nFORMAT\nFINAL');
    expect(shots[0]).toEqual(card[0]);
    expect(shots.slice(-2)).toEqual(card.slice(-2));
    expect(shots.length - card.length).toBe(26);
    const invalid = structuredClone(bank);
    invalid.shots[0]!.messages[1]!.content =
      '<expression>{"memory":[0],"intent":"conversar","emotion":"neutra","intensity":0.15}</expression>Hello';
    expect(() => ShotBankSchema.parse(invalid)).toThrow();
  });
  it('reads legacy regression envelope and BOM without modifying frozen files', async () => {
    expect(
      parseScenarioDataset(
        await readFile(new URL('regression.json', old), 'utf8'),
      ).cases,
    ).toHaveLength(18);
    expect(() => parseScenarioDataset('{"cases":null}')).toThrow();
  });
});
