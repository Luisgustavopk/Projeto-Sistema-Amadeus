import { createHash } from 'node:crypto';
import { judgeCriteria } from './judge.ts';

export const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function words(text: string) {
  return (
    text
      .normalize('NFKC')
      .toLocaleLowerCase('pt-BR')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function grams(text: string, size: number) {
  const tokens = words(text);

  return new Set(
    tokens
      .slice(0, Math.max(0, tokens.length - size + 1))
      .map((_, index) => tokens.slice(index, index + size).join(' ')),
  );
}

/** Diagnostics only. Never imported by generation, memory or voice runtime. */
export function literalOverlap(reply: string, sources: string[], size = 8) {
  const candidates = grams(reply, size);
  const reference = new Set(
    sources.flatMap((source) => [...grams(source, size)]),
  );
  const matched = [...candidates].filter((gram) => reference.has(gram));

  return {
    matched,
    fraction: candidates.size ? matched.length / candidates.size : 0,
  };
}

export function textDiagnostics(
  reply: string,
  examples: string[],
  earlier: string[],
) {
  return {
    words: words(reply).length,
    sentences: [
      ...new Intl.Segmenter('pt-BR', { granularity: 'sentence' }).segment(
        reply,
      ),
    ].filter((item) => words(item.segment).length).length,
    questions: (reply.match(/\?+/gu) ?? []).length,
    opening: words(reply).slice(0, 6).join(' '),
    exampleCopy: literalOverlap(reply, examples),
    recentCopy: literalOverlap(reply, earlier),
  };
}

export function contamination(
  cases: { id: string; turns: (string | { initiativeKind: string })[] }[],
  documents: string[],
) {
  return cases.flatMap((scenario) =>
    scenario.turns.flatMap((turn, index) => {
      if (typeof turn !== 'string') {
        return [];
      }

      const normalized = words(turn).join(' ');
      const exact =
        words(turn).length >= 4 &&
        documents.some((document) =>
          words(document).join(' ').includes(normalized),
        );
      const overlap = literalOverlap(turn, documents);

      return exact || overlap.matched.length
        ? [
            {
              id: scenario.id,
              turn: index + 1,
              exact,
              fragments: overlap.matched,
            },
          ]
        : [];
    }),
  );
}

export function quantiles(values: number[]) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);

  if (!sorted.length) {
    return { samples: 0, p50: null, p95: null };
  }

  const middle = Math.floor(sorted.length / 2);

  return {
    samples: sorted.length,
    p50:
      sorted.length % 2
        ? sorted[middle]!
        : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
  };
}

export function wilson(passed: number, total: number) {
  if (
    !Number.isInteger(passed) ||
    !Number.isInteger(total) ||
    passed < 0 ||
    total < passed
  ) {
    throw new Error('Contagem inválida.');
  }

  if (!total) {
    return { rate: null, lower: null, upper: null };
  }

  const z = 1.96,
    p = passed / total,
    denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const radius =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denominator;

  return {
    rate: p,
    lower: Math.max(0, center - radius),
    upper: Math.min(1, center + radius),
  };
}

/** Missing verdicts remain visible. Intervals are descriptive, not cluster-adjusted. */
export function approvalRates(
  turns: {
    verdict?: {
      checks: Record<string, { applicable: boolean; pass: boolean | null }>;
    } | null;
  }[],
) {
  const keys = new Set([
    ...judgeCriteria,
    ...turns.flatMap((turn) => Object.keys(turn.verdict?.checks ?? {})),
  ]);

  return Object.fromEntries(
    [...keys].map((key) => {
      let passed = 0,
        failed = 0,
        unknown = 0,
        notApplicable = 0;

      for (const turn of turns) {
        const check = turn.verdict?.checks[key];

        if (!check || (check.applicable && check.pass === null)) {
          unknown++;
        } else if (!check.applicable) {
          notApplicable++;
        } else if (check.pass) {
          passed++;
        } else {
          failed++;
        }
      }

      const eligible = passed + failed;

      return [
        key,
        {
          passed,
          failed,
          unknown,
          notApplicable,
          attempted: turns.length,
          ...wilson(passed, eligible),
          intervalScope:
            'turn-level descriptive interval; conversation clustering is not corrected',
        },
      ];
    }),
  );
}
