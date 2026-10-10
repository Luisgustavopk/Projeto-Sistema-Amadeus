import { z } from 'zod';

export const LLAMA_REFINEMENT_MODEL = 'meta-llama/llama-3.3-70b-instruct';
export const DEEPSEEK_REFINEMENT_MODEL = 'deepseek/deepseek-v4.1-flash';
// USD per million tokens. Paid access is explicit and limited to approved authors.
export const OpenRouterPaidSchema = z.strictObject({
  maxPromptPrice: z.number().positive().max(0.15),
  maxCompletionPrice: z.number().positive().max(0.42),
});

export function validOpenRouterPayment(config: {
  adapter: string;
  model?: string | undefined;
  openRouterPaid?: z.infer<typeof OpenRouterPaidSchema> | undefined;
}) {
  if (config.openRouterPaid) {
    return (
      config.adapter === 'openrouter' &&
      [LLAMA_REFINEMENT_MODEL, DEEPSEEK_REFINEMENT_MODEL].includes(
        config.model ?? '',
      ) &&
      (config.model !== LLAMA_REFINEMENT_MODEL ||
        config.openRouterPaid.maxCompletionPrice <= 0.4) &&
      OpenRouterPaidSchema.safeParse(config.openRouterPaid).success
    );
  }

  return (
    config.adapter !== 'openrouter' || Boolean(config.model?.endsWith(':free'))
  );
}
