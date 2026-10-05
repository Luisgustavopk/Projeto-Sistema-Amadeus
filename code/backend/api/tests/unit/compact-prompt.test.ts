import { expect, it } from 'vitest';
import { buildCompactPersonaPrompt } from '../../src/application/persona/compact-prompt.ts';

it('experimento compacto mantém identidade, limites e origem da referência', () => {
  const prompt = buildCompactPersonaPrompt();
  expect(prompt).toContain('anterior à viagem de Kurisu ao Japão');
  expect(prompt).toContain('Persona_Kurisu_Amadeus_v0.4.md');
  expect(prompt).toContain('sem preocupação obrigatória');
  expect(prompt).toContain('não lembranças');
  expect(prompt).toContain('<expression>');
  expect(prompt.length).toBeLessThan(5000);
});

it('variante de fala não solicita nem contém cabeçalho de expressão', () => {
  const prompt = buildCompactPersonaPrompt(undefined, true);
  expect(prompt).not.toContain('<expression>');
  expect(prompt).toContain('sem cabeçalho, tags, JSON ou metadados');
});
