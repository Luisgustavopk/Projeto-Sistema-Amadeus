import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  extractPersonaDocumentReference,
  PERSONA_DOCUMENT_REFERENCE,
  PERSONA_DOCUMENT_SECTIONS,
} from '../../src/application/persona/document-reference.ts';
import {
  buildPersonaPrompt,
  buildSpeechOnlyPersonaPrompt,
} from '../../src/application/persona/prompt.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';

const document = readFileSync(
  new URL('../../../assets/persona/source-v0.4.md', import.meta.url),
  'utf8',
);

it('inclui trechos reais do documento no prompt normal e na recuperação, separados do histórico', () => {
  const extracted = extractPersonaDocumentReference(document);
  const context = buildVoiceContext([], 'Olá.', 'synthetic');

  for (const id of PERSONA_DOCUMENT_SECTIONS) {
    expect(extracted).toContain(`### ${id} `);
  }

  expect(extracted).toContain('gatilho → interpretação contextual');
  expect(extracted).toContain('### 14.5 Exemplos originais em pt-BR');
  expect(extracted).not.toContain('### 4.2 Enredo principal');
  expect(extracted).not.toContain('## 9. Prompt-base compacto');
  expect(extracted).not.toContain('## 10. Critérios e cenários');
  expect(context.systemPrompt).toContain(PERSONA_DOCUMENT_REFERENCE);
  expect(context.content).not.toContain(PERSONA_DOCUMENT_REFERENCE);
  expect(buildSpeechOnlyPersonaPrompt()).toContain(PERSONA_DOCUMENT_REFERENCE);
  expect(context.systemPrompt).toContain(
    'As regras estruturadas deste prompt têm prioridade',
  );
  expect(
    context.systemPrompt.indexOf('</persona_document_reference>'),
  ).toBeLessThan(context.systemPrompt.indexOf('\nEXPRESSÃO:'));
});

it('mantém o prompt abaixo do limite da API com o maior estado expressivo', () => {
  const expression = {
    intent: 'provocacao_afetuosa' as const,
    emotion: 'constrangimento_leve' as const,
    intensity: 0.7,
  };
  expect(buildPersonaPrompt(expression).length).toBeLessThanOrEqual(32768);
  expect(buildSpeechOnlyPersonaPrompt(expression).length).toBeLessThanOrEqual(
    32768,
  );
});

it('recusa seções ausentes ou excessivas sem truncar e aceita finais de linha Windows', () => {
  expect(
    extractPersonaDocumentReference(document.replace(/\r?\n/g, '\r\n')),
  ).toBe(extractPersonaDocumentReference(document));
  expect(() =>
    extractPersonaDocumentReference(document.replace('### 5.2 ', '### 5.20 ')),
  ).toThrow('Seção 5.2 ausente');
  expect(() =>
    extractPersonaDocumentReference(
      document
        .replace('### 5.2 ', `${'x'.repeat(6001)}\n### 5.2 `)
        .replace('### 5.3 ', `${'x'.repeat(6001)}\n### 5.3 `),
    ),
  ).toThrow('excede 6000');
});
