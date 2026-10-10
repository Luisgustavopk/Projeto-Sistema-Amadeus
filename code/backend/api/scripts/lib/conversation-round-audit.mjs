import {
  literalOverlap,
  quantiles,
} from '../../src/evaluation/persona/diagnostics.ts';

/** Offline diagnostics only: does not label human approval or change runtime. */
export function auditQualityReport(report) {
  const entries = report.referenceResources?.entries ?? [];
  const cells = report.models.flatMap((model) =>
    report.variants.map((variant) => ({ model, variant })),
  );
  return cells.map((cell) => {
    const turns = report.cases
      .filter(
        (item) => item.model === cell.model && item.variant === cell.variant,
      )
      .flatMap((item) =>
        item.turns.map((turn) => ({
          ...turn,
          caseId: item.id,
          sample: item.sample,
        })),
      );
    const completed = turns.filter(
      (turn) => turn.assistant && !turn.errors.length,
    );
    const observations = completed.map((turn) => {
      const ids = turn.references?.ids ?? [];
      const examples = entries.filter((entry) => ids.includes(entry.id));
      const copied = literalOverlap(
        turn.assistant,
        examples.flatMap((entry) =>
          entry.dialogue
            .filter((message) => message.role === 'assistant')
            .map((message) => message.content),
        ),
      );
      const headers = [
        ...(turn.rawReply ?? '').matchAll(
          /<expression>([\s\S]*?)<\/expression>/gu,
        ),
      ].flatMap((match) => {
        try {
          return [JSON.parse(match[1])];
        } catch {
          return [];
        }
      });
      const memory = headers.at(-1)?.memory;
      const claimedIndices = Array.isArray(memory) ? memory : memory?.facts;
      return {
        caseId: turn.caseId,
        sample: turn.sample,
        user: turn.user,
        initiativeKind: turn.initiativeKind ?? null,
        assistant: turn.assistant,
        examples: ids,
        corpusCopy: copied,
        factCount: (turn.facts ?? []).length,
        factsInPrompt: (turn.facts ?? []).map((fact) => ({
          id: fact.id,
          present: (turn.inputs ?? []).some((input) =>
            input.messages[0]?.content.includes(fact.text),
          ),
        })),
        declaredMemory: memory ?? null,
        memoryHeaderPresent: memory !== undefined,
        emptyMemory:
          Array.isArray(claimedIndices) && claimedIndices.length === 0,
        indicesValid:
          Array.isArray(claimedIndices) &&
          claimedIndices.every(
            (index) =>
              Number.isInteger(index) &&
              index >= 0 &&
              index < (turn.facts ?? []).length,
          ),
        stageDurations: turn.stageDurations ?? {},
      };
    });
    const nonzero = observations.filter((turn) => turn.factCount > 0);
    return {
      ...cell,
      attemptedTurns: turns.length,
      completedTurns: completed.length,
      actualExamples: quantiles(
        observations.map((turn) => turn.examples.length),
      ),
      exampleCountDistribution: Object.fromEntries(
        [...new Set(observations.map((turn) => turn.examples.length))].map(
          (count) => [
            count,
            observations.filter((turn) => turn.examples.length === count)
              .length,
          ],
        ),
      ),
      corpusLiteralCopies: observations.filter(
        (turn) => turn.corpusCopy.matched.length,
      ).length,
      factsAvailableTurns: nonzero.length,
      allFactsReachedPromptTurns: nonzero.filter((turn) =>
        turn.factsInPrompt.every((fact) => fact.present),
      ).length,
      emptyDeclaredMemoryWithFacts: nonzero.filter((turn) => turn.emptyMemory)
        .length,
      absentMemoryHeaderWithFacts: nonzero.filter(
        (turn) => !turn.memoryHeaderPresent,
      ).length,
      invalidDeclaredIndicesWithFacts: nonzero.filter(
        (turn) => turn.memoryHeaderPresent && !turn.indicesValid,
      ).length,
      memoryDeclarationLimitation:
        'Autodeclaração não comprova uso ou sustentação. Busca e extração reais não são exercidas pelas fixtures.',
      observations,
    };
  });
}
