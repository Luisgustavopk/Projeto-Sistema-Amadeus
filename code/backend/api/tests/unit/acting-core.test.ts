import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  buildActingCore,
  actingDiagnostics,
  actingTurnDirection,
} from '../../src/application/persona/acting-core.ts';
import { addressNameDirection } from '../../src/application/persona/configuration.ts';

it('carrega a ficha ensaiada sem substituir as referências por fatos da conversa', () => {
  const card = readFileSync(
    new URL(
      '../../../evals/persona/quality-v2.1/core-card.md',
      import.meta.url,
    ),
    'utf8',
  ).trim();
  const refined = buildActingCore('refined');
  expect(refined).toContain(card);
  expect(refined).toContain('persona_expressive_direction');
  expect(refined.length).toBeLessThan(buildActingCore('curated').length);
  expect(actingTurnDirection('refined')).not.toBe('');
  expect(actingDiagnostics('refined').coreHash).toMatch(/^[a-f0-9]{64}$/);
  expect(actingDiagnostics('refined').sources).toHaveLength(2);
});

it('separa vocativo confirmado de nome civil e de cenários sintéticos', () => {
  const config = {
    version: 'test',
    revision: 1,
    direction: '',
    updatedAt: null,
    preferredAddressName: 'Alex',
  };
  expect(addressNameDirection(config, 'personal')).toContain(
    '"preferredAddressName":"Alex"',
  );
  expect(addressNameDirection(config, 'synthetic')).toBe('');
  expect(
    addressNameDirection({ ...config, preferredAddressName: null }, 'personal'),
  ).toBe('');
});
