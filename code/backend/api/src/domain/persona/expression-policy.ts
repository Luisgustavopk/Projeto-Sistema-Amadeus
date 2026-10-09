import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  type Expression,
} from './expression.ts';

/** Session-local artistic state. It does not represent user facts or memories. */
export function createExpressionState() {
  let current: Expression = { ...NEUTRAL_EXPRESSION };

  return {
    snapshot(): Expression {
      return { ...current };
    },
    accept(proposal: unknown): Expression {
      const parsed = ExpressionSchema.safeParse(proposal);
      current = parsed.success ? { ...parsed.data } : { ...NEUTRAL_EXPRESSION };
      // Context belongs to the generator. Do not infer contradictions from labels
      // alone or erase a valid reaction because it repeats the previous emotion.
      // Long-term PAD smoothing remains in persistent-state.ts.

      return { ...current };
    },
  };
}
