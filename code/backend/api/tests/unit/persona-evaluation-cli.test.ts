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
  it('requires an explicit budget and plans both acting arms without network', () => {
    expect(() => run(['--suite=quality-v2.1'])).toThrow();
    const plan = JSON.parse(
      run([
        '--suite=quality-v2.1',
        '--budget=0.25',
        '--only=D01,D02',
        '--variants=card,card-shots',
        '--shots=2',
      ]),
    );
    expect(plan).toMatchObject({
      plannedTurns: 120,
      samples: 10,
      actualDemonstrations: 19,
      run: false,
      productionChanged: false,
      models: ['llama'],
    });
    expect(plan.actingCoreCharacters.card).toBeLessThan(
      plan.actingCoreCharacters.current,
    );
  });
  it('plans legacy BOM/envelope regression without mutating the frozen dataset', () => {
    const plan = JSON.parse(run(['--split=regression', '--variants=current']));
    expect(plan.cases).toBe(18);
    expect(plan.run).toBe(false);
  });
});
