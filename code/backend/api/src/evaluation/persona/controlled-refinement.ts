import { readFileSync } from 'node:fs';
import type { z } from 'zod';
import {
  ExpressionSchema,
  EMOTION_PRESENTATIONS,
  describeDelivery,
} from '../../domain/persona/expression.ts';
import type { ShotBankSchema } from './experimental-suite.ts';

const initiativeTask = readFileSync(
  new URL(
    '../../../../evals/persona/quality-v6/initiative-task.md',
    import.meta.url,
  ),
  'utf8',
).trim();

/** Evaluation-only: application events, never keyword guesses about the user. */
export function appendInitiativeTask(
  messages: { role: string; content: string }[],
  kind: string | undefined,
  history: { userText: string; initiativeKind?: string }[],
) {
  if (kind !== 'initiative') {
    return messages;
  }

  const anchor = history
    .filter((turn) => !turn.initiativeKind && turn.userText.trim())
    .slice(-3)
    .map((turn) => turn.userText);

  return [
    ...messages,
    {
      role: 'system',
      content:
        initiativeTask +
        '\n' +
        JSON.stringify({
          movement: 'observacao',
          anchor,
          source: 'current-conversation-user-turns',
        }),
    },
  ];
}

/** A vector ranking, independent of language, scenario IDs and evaluation labels. */
export function contextualShotBank(
  bank: z.infer<typeof ShotBankSchema>,
  scores: { id: string; relevance: number }[],
  maxExamples = 3,
) {
  if (!Number.isInteger(maxExamples) || maxExamples < 0 || maxExamples > 6) {
    throw new Error('Limite de exemplos inválido.');
  }

  if (scores.some((score) => !Number.isFinite(score.relevance))) {
    throw new Error('Relevância inválida.');
  }

  const eligible = new Set(
    bank.levels['1']!.filter((id) =>
      bank.shots.some(
        (shot) =>
          shot.id === id &&
          shot.kind === 'style-adaptation' &&
          !shot.facts.length,
      ),
    ),
  );
  const ranked = scores
    .filter((score) => eligible.has(score.id))
    .sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id));
  const best = ranked[0]?.relevance ?? 0;
  const ids = [
    ...new Set(
      ranked
        .filter((score) => score.relevance >= Math.max(0.4, best - 0.08))
        .map((score) => score.id),
    ),
  ].slice(0, maxExamples);

  return { ...bank, levels: { ...bank.levels, '1': ids } };
}

/** Describes capability gaps; these proposals never become wire events or TTS controls. */
export function expressionDeliveryReview(proposal: unknown) {
  const parsed = ExpressionSchema.safeParse(proposal);

  if (!parsed.success) {
    return {
      valid: false as const,
      semanticAlignment: 'not-evaluated' as const,
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        code: issue.code,
      })),
    };
  }

  const expression = parsed.data;
  const artistic = EMOTION_PRESENTATIONS[expression.emotion];

  return {
    valid: true as const,
    expression,
    currentDelivery: describeDelivery(expression),
    artisticProposal: { visual: artistic.visual, vocal: artistic.vocal },
    executable: false,
    semanticAlignment: 'pending-contextual-review' as const,
  };
}
