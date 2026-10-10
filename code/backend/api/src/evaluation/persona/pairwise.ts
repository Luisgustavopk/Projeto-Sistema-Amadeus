import { z } from 'zod';

export const PairwiseVerdictSchema = z.strictObject({
  winner: z.enum(['A', 'B', 'tie', 'uncertain']),
  bothAcceptable: z.boolean().nullable(),
  evidence: z.string().min(1).max(1000),
});
type Verdict = z.infer<typeof PairwiseVerdictSchema>;

export function stablePairwiseDecision(
  forward: Verdict | null,
  reverse: Verdict | null,
) {
  if (!forward || !reverse) {
    return {
      winner: 'uncertain' as const,
      reason: 'missing-verdict',
      bothAcceptable: null,
    };
  }

  const inverted =
    reverse.winner === 'A'
      ? 'B'
      : reverse.winner === 'B'
        ? 'A'
        : reverse.winner;
  const winner = forward.winner === inverted ? forward.winner : 'uncertain';

  return {
    winner,
    reason:
      winner === 'uncertain' ? 'uncertain-or-order-sensitive' : 'order-stable',
    bothAcceptable:
      forward.bothAcceptable === reverse.bothAcceptable
        ? forward.bothAcceptable
        : null,
  };
}

type Observation = {
  scenario: string;
  sample: number;
  winner: string;
  bothAcceptable: boolean | null;
};

/** Bootstrap scenario clusters, retaining correlated turns and samples together. */
export function pairwiseSummary(
  observations: Observation[],
  seed = 217,
  draws = 2000,
) {
  const scenarios = [...new Set(observations.map((o) => o.scenario))];
  const groups = scenarios.map((id) => {
    const rows = observations.filter(
      (o) => o.scenario === id && o.winner !== 'uncertain',
    );

    return rows.length
      ? rows.reduce(
          (s, o) => s + (o.winner === 'B' ? 1 : o.winner === 'tie' ? 0.5 : 0),
          0,
        ) / rows.length
      : null;
  });
  const known = groups.filter((n): n is number => n !== null);
  let state = seed >>> 0;

  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };

  const bootstrap: number[] = [];

  if (known.length >= 2) {
    for (let i = 0; i < draws; i++) {
      bootstrap.push(
        known.reduce(
          (sum) => sum + known[Math.floor(random() * known.length)]!,
          0,
        ) / known.length,
      );
    }
  }

  bootstrap.sort((a, b) => a - b);

  return {
    pairs: observations.length,
    scenarioClusters: scenarios.length,
    resolvedScenarioClusters: known.length,
    unknown: observations.filter((o) => o.winner === 'uncertain').length,
    ties: observations.filter((o) => o.winner === 'tie').length,
    notBothAcceptable: observations.filter((o) => o.bothAcceptable === false)
      .length,
    bPreference: known.length
      ? known.reduce((s, n) => s + n, 0) / known.length
      : null,
    confidence95: bootstrap.length
      ? {
          lower: bootstrap[Math.floor(draws * 0.025)]!,
          upper: bootstrap[Math.min(draws - 1, Math.floor(draws * 0.975))]!,
        }
      : null,
    seed,
    draws,
    exploratory: scenarios.length < 10,
    approved: false,
    limitation:
      'Preferência relativa não certifica persona. IC reamostra cenários; desconhecidos ficam explícitos. Poucos cenários produzem evidência exploratória. Exige calibração humana e critérios absolutos.',
  };
}
