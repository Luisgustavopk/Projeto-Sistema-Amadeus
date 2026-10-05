import { z } from 'zod';

export const PERSONA_VERSION = 'kurisu-amadeus-0.4.8';

export const ExpressionSchema = z.strictObject({
  intent: z.enum([
    'conversar',
    'explorar',
    'corrigir',
    'discordar',
    'provocacao_afetuosa',
    'agradecer',
    'acolher',
    'corrigir_se',
    'admitir_limite',
    'retomar',
    'ceder_turno',
    'limitar',
    'esclarecer',
    'compartilhar',
  ]),
  emotion: z.enum([
    'neutra',
    'curiosidade',
    'firmeza_calma',
    'ironia_leve',
    'irritacao_leve',
    'constrangimento_leve',
    'preocupacao',
    'autocritica_leve',
    'calor_discreto',
    'alegria_discreta',
  ]),
  intensity: z.number().finite().min(0).max(1),
});

export type Expression = z.infer<typeof ExpressionSchema>;

export const NEUTRAL_EXPRESSION: Expression = {
  intent: 'conversar',
  emotion: 'neutra',
  intensity: 0.15,
};

export const DeliveryPresetSchema = z.enum([
  'neutro_claro_v1',
  'seco_suave_v1',
  'hesitante_baixo_v1',
  'acolhedor_calmo_v1',
]);

export function describeDelivery(expression: Expression) {
  const deliveryPresetId =
    expression.intent === 'acolher' || expression.emotion === 'preocupacao'
      ? 'acolhedor_calmo_v1'
      : expression.emotion === 'ironia_leve'
        ? 'seco_suave_v1'
        : expression.emotion === 'constrangimento_leve'
          ? 'hesitante_baixo_v1'
          : 'neutro_claro_v1';

  return {
    deliveryPresetId: DeliveryPresetSchema.parse(deliveryPresetId),
    avatarExpression:
      expression.emotion === 'ironia_leve' ||
      expression.emotion === 'alegria_discreta'
        ? ('sorriso_discreto' as const)
        : expression.emotion === 'curiosidade'
          ? ('olhar_atento' as const)
          : ('expressao_neutra' as const),
  };
}
