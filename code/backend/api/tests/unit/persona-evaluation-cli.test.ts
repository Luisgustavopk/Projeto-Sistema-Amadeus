import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../scripts/eval-conversation-quality.mjs', import.meta.url),
);
const denyNetwork =
  'data:text/javascript,' +
  encodeURIComponent(
    'globalThis.fetch=()=>{throw new Error("NETWORK_FORBIDDEN_IN_DRY_RUN")};',
  );
const run = (args: string[]) =>
  execFileSync(process.execPath, ['--import', denyNetwork, script, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, OPENROUTER_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
describe('evaluation dry run before any remote access', () => {
  it('requires an explicit budget and refuses historical execution with changed code before network', () => {
    expect(() => run(['--suite=quality-v2.1'])).toThrow();
    const options = [
      '--suite=quality-v2.1',
      '--budget=0.25',
      '--only=D01,D02',
      '--variants=card,card-shots',
      '--shots=2',
    ];
    expect(() => run(options)).toThrow(
      'Recurso v2.1 alterado após congelamento: ../../../api/src/evaluation/persona/router.ts',
    );
    expect(() => run([...options, '--run'])).toThrow(
      'Recurso v2.1 alterado após congelamento: ../../../api/src/evaluation/persona/router.ts',
    );
  }, 30000);
  it('prepares the emotional round without remote access, keys or renewed budget', () => {
    const emotionalScript = fileURLToPath(
      new URL('../../scripts/prepare-emotional-suite.mjs', import.meta.url),
    );
    const output = execFileSync(
      process.execPath,
      ['--import', denyNetwork, emotionalScript],
      {
        encoding: 'utf8',
        timeout: 20000,
        env: { ...process.env, OPENROUTER_API_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    expect(JSON.parse(output)).toMatchObject({
      prepared: true,
      suiteVersion: 'quality-v4-emotional-pt-BR-draft-1',
      cases: 24,
      turnsPerModel: 96,
      plannedTurnsThreeModels: 288,
      inferenceCalls: 0,
    });
    expect(() =>
      execFileSync(process.execPath, [emotionalScript, '--run'], {
        stdio: 'pipe',
      }),
    ).toThrow('não aceita --run');
  });
  it('plans legacy BOM/envelope regression without mutating the frozen dataset', () => {
    const plan = JSON.parse(run(['--split=regression', '--variants=current']));
    expect(plan.cases).toBe(18);
    expect(plan.run).toBe(false);
  });
  it('requires the new emotional budget and prepares 144 turns before any network access', () => {
    const emotionalScript = fileURLToPath(
      new URL('../../scripts/eval-emotional-suite.mjs', import.meta.url),
    );
    const invoke = (args: string[]) =>
      execFileSync(
        process.execPath,
        ['--import', denyNetwork, emotionalScript, ...args],
        {
          encoding: 'utf8',
          timeout: 20000,
          env: { ...process.env, OPENROUTER_API_KEY: '' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    expect(() => invoke([])).toThrow('teto explícito');
    expect(() => invoke(['--budget=0.5'])).toThrow('teto explícito');
    const plan = JSON.parse(invoke(['--budget=0.25']));
    expect(plan).toMatchObject({
      prepared: true,
      run: false,
      maxUsd: 0.25,
      plannedTurns: 144,
    });
    expect(plan.estimateUsdNoCache).toBeLessThan(0.25);
    expect(() => invoke(['--budget=0.25', '--run'])).toThrow(
      'OPENROUTER_API_KEY ausente',
    );
  }, 30000);
});
