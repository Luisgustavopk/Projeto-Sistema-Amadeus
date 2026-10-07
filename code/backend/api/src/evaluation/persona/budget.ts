export function createEvaluationBudget(maxUsd: number) {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 5) {
    throw new Error('Orçamento de avaliação inválido.');
  }

  let committed = 0,
    reported = 0,
    unreportedCalls = 0;
  const reservations = new Map<string, number>();
  const usedIds = new Set<string>();

  return {
    reserve(
      id: string,
      messages: unknown,
      outputTokens: number,
      prices: { prompt: number; completion: number },
    ) {
      if (usedIds.has(id)) {
        throw new Error('Reserva duplicada.');
      }

      if (
        !Number.isFinite(prices.prompt) ||
        !Number.isFinite(prices.completion) ||
        prices.prompt < 0 ||
        prices.completion < 0 ||
        !Number.isInteger(outputTokens) ||
        outputTokens < 1
      ) {
        throw new Error('Estimativa inválida.');
      }

      // UTF-8 byte bound deliberately overestimates input tokens, including JSON.
      const ceiling =
        ((Buffer.byteLength(JSON.stringify(messages), 'utf8') + 2048) *
          prices.prompt) /
          1000000 +
        (outputTokens * prices.completion) / 1000000;

      if (committed + ceiling > maxUsd + 1e-12) {
        throw new Error('EVALUATION_BUDGET_EXHAUSTED');
      }

      reservations.set(id, ceiling);
      usedIds.add(id);
      committed += ceiling;

      return ceiling;
    },
    settle(id: string, costUsd: number | null | undefined) {
      const ceiling = reservations.get(id);

      if (ceiling === undefined) {
        throw new Error('Reserva ausente.');
      }

      if (costUsd === undefined || costUsd === null) {
        reservations.delete(id);
        unreportedCalls++;

        return;
      }

      if (!Number.isFinite(costUsd) || costUsd < 0) {
        throw new Error('Custo reportado inválido.');
      }

      reservations.delete(id);
      committed += costUsd - ceiling;
      reported += costUsd;

      if (costUsd > ceiling + 1e-8 || committed > maxUsd + 1e-8) {
        throw new Error('EVALUATION_PRICE_CEILING_VIOLATION');
      }
    },
    snapshot: () => ({
      maxUsd,
      committedUsd: committed,
      reportedUsd: reported,
      unresolvedCalls: reservations.size,
      unreportedCalls,
    }),
  };
}
