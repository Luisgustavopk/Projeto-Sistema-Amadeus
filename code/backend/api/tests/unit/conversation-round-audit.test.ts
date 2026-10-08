import { expect, it } from 'vitest';
// @ts-expect-error Offline JavaScript evaluator has no declaration file.
import { auditQualityReport } from '../../scripts/lib/conversation-round-audit.mjs';

it('detects actual corpus copying and distinguishes missing facts from undeclared memory without certifying grounding', () => {
  const assistant =
    'Uma frase editorial suficientemente longa para identificar uma cópia literal.';
  const report = {
    models: ['llama'],
    variants: ['examples-2'],
    referenceResources: {
      entries: [
        { id: 'e1', dialogue: [{ role: 'assistant', content: assistant }] },
      ],
    },
    cases: [
      {
        model: 'llama',
        variant: 'examples-2',
        id: 'M',
        sample: 1,
        turns: [
          {
            assistant,
            user: 'Oi',
            rawReply: '<expression>{"memory":[]}</expression>' + assistant,
            errors: [],
            references: { ids: ['e1'] },
            facts: [{ id: 'f0', text: 'Fato disponível' }],
            inputs: [{ messages: [{ content: 'Fato disponível' }] }],
          },
        ],
      },
    ],
  };
  const [audit] = auditQualityReport(report);
  expect(audit).toMatchObject({
    corpusLiteralCopies: 1,
    allFactsReachedPromptTurns: 1,
    emptyDeclaredMemoryWithFacts: 1,
    invalidDeclaredIndicesWithFacts: 0,
  });
  report.cases[0]!.turns[0]!.inputs[0]!.messages[0]!.content = 'Sem contexto';
  report.cases[0]!.turns[0]!.rawReply =
    '<expression>{"memory":[7]}</expression>' + assistant;
  const [missing] = auditQualityReport(report);
  expect(missing).toMatchObject({
    allFactsReachedPromptTurns: 0,
    emptyDeclaredMemoryWithFacts: 0,
    invalidDeclaredIndicesWithFacts: 1,
  });
});
