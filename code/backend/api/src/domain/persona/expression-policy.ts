import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  type Expression,
} from './expression.ts';

/** Session-local artistic state. It does not represent user facts or memories. */
export function createExpressionState() {
  let current: Expression = { ...NEUTRAL_EXPRESSION };
  let neutralTurns = 0;

  return {
    snapshot(): Expression {
      return { ...current };
    },
    accept(proposal: unknown): Expression {
      const parsed = ExpressionSchema.safeParse(proposal);
      const next = parsed.success
        ? { ...parsed.data }
        : { ...NEUTRAL_EXPRESSION };

      if (next.intent === 'acolher' || next.emotion === 'preocupacao') {
        next.emotion = 'preocupacao';
        next.intent = 'acolher';
      } else if (next.intent === 'provocacao_afetuosa') {
        next.emotion = 'ironia_leve';
      }

      // The model must find a new contextual cue before repeating teasing.
      // Until that cue can be verified, adjacent ironic turns use neutral delivery.
      if (next.emotion === 'ironia_leve' && current.emotion === 'ironia_leve') {
        next.emotion = 'neutra';
        next.intent = 'conversar';
      }

      neutralTurns = next.emotion === 'neutra' ? neutralTurns + 1 : 0;
      const target =
        next.emotion === 'neutra'
          ? NEUTRAL_EXPRESSION.intensity
          : Math.min(0.7, next.intensity);
      next.intensity =
        next.intent === 'acolher' || neutralTurns >= 3
          ? target
          : Math.max(
              0,
              Math.min(
                0.7,
                Math.max(
                  current.intensity - 0.2,
                  Math.min(target, current.intensity + 0.2),
                ),
              ),
            );
      next.intensity = Math.round(next.intensity * 100) / 100;
      current = next;

      return { ...current };
    },
  };
}
