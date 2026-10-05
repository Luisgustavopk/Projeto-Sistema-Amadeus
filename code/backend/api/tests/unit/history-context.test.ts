import { expect, it } from 'vitest';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { buildHistoryContext } from '../../src/application/voice/history-context.ts';

it('preserva detalhes depois de 600 caracteres e sinaliza reprodução parcial', () => {
  const detail = 'A preocupação é a voz artificial.';
  const history = [
    {
      userText: 'Uma observação. '.repeat(45) + detail,
      generatedText: 'Vamos comparar.',
      dataClass: 'personal' as const,
      responseStatus: 'interrupted' as const,
      partiallyPlayed: true,
    },
  ];
  const result = buildVoiceContext(
    history,
    'Qual era a preocupação?',
    'synthetic',
  );
  expect(result.content).toContain(detail);
  expect(result.content).toContain('"partiallyPlayed":true');
  expect(result.content).toContain('"responseStatus":"interrupted"');
  expect(result.dataClass).toBe('personal');
});

it('limita o histórico pelas entradas mais recentes, sem cortar palavras', () => {
  const entries = Array.from({ length: 20 }, (_, index) => ({
    userText: `Turno ${index}. ` + 'Uma frase completa. '.repeat(200),
    generatedText: 'Outro detalhe. '.repeat(200),
    dataClass: 'synthetic' as const,
  }));
  const selected = buildHistoryContext(entries);
  expect(JSON.stringify(selected).length).toBeLessThan(8100);
  expect(selected.at(-1)?.user).toContain('Turno 19.');
  expect(selected[0]?.user).toMatch(/\. \[trecho omitido\]$/u);
});

it('classificação considera também histórico omitido do contexto', () => {
  const history = Array.from({ length: 15 }, (_, index) => ({
    userText: 'Oi.',
    generatedText: 'Olá.',
    dataClass: index === 0 ? ('local-only' as const) : ('synthetic' as const),
  }));
  expect(buildVoiceContext(history, 'Oi.', 'synthetic').dataClass).toBe(
    'local-only',
  );
});
