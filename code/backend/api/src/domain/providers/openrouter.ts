import { z } from 'zod';

export const LLAMA_REFINEMENT_MODEL = 'meta-llama/llama-3.3-70b-instruct';
// USD per million tokens. Paid access is explicit and limited to this experiment.
export const OpenRouterPaidSchema = z.strictObject({
  maxPromptPrice: z.number().positive().max(0.15),
  maxCompletionPrice: z.number().positive().max(0.4),
});

export function validOpenRouterPayment(config: {
  adapter: string;
  model?: string | undefined;
  openRouterPaid?: z.infer<typeof OpenRouterPaidSchema> | undefined;
}) {
  if (config.openRouterPaid) {
    return (
      config.adapter === 'openrouter' &&
      config.model === LLAMA_REFINEMENT_MODEL &&
      OpenRouterPaidSchema.safeParse(config.openRouterPaid).success
    );
  }

  return (
    config.adapter !== 'openrouter' || Boolean(config.model?.endsWith(':free'))
  );
}
