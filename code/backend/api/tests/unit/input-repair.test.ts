import { expect, it } from 'vitest';
import { createInputRepair } from '../../src/application/persona/input-repair.ts';

it('varia os reparos na mesma chamada e mantém a sequência isolada entre chamadas', () => {
  const firstCall = createInputRepair();
  const secondCall = createInputRepair();
  const initial = firstCall();
  const following = [firstCall(), firstCall(), firstCall()];
  expect(new Set([initial, ...following]).size).toBe(4);
  expect(secondCall()).toBe(initial);
  expect(firstCall()).toBe(initial);
});
