import { describe, expect, it } from 'vitest';
import { HealthSchema, CapabilitiesSchema } from '../../src/http/schemas.ts';

describe('contratos públicos', () => {
  it('rejeita saúde diferente de uma resposta válida', () => {
    expect(HealthSchema.safeParse({ status: 'ok' }).success).toBe(false);
    expect(
      HealthSchema.safeParse({ status: 'offline', service: 'amadeus-api' })
        .success,
    ).toBe(false);
  });
  it('não aceita disponibilidade textual como capacidade booleana', () => {
    expect(CapabilitiesSchema.safeParse({ voice: 'false' }).success).toBe(
      false,
    );
  });
});
