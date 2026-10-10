import { z } from 'zod';

export const PERSONA_VERSION = 'kurisu-amadeus-0.4.23';

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
    'brincadeira',
    'ironizar',
    'questionar',
    'refletir',
    'explicar',
    'argumentar',
    'concordar',
    'ponderar',
    'sugerir',
    'recomendar',
    'celebrar',
    'elogiar',
    'encorajar',
    'consolar',
    'tranquilizar',
    'demonstrar_afeto',
    'desabafar',
    'reagir',
    'desculpar_se',
    'reconciliar',
    'recusar',
    'negociar',
    'alertar',
    'cumprimentar',
    'despedir_se',
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
    'alegria',
    'entusiasmo',
    'divertimento',
    'orgulho',
    'satisfacao',
    'gratidao',
    'afeto',
    'ternura',
    'esperanca',
    'alivio',
    'serenidade',
    'surpresa',
    'espanto',
    'admiracao',
    'interesse',
    'duvida',
    'confusao',
    'ceticismo',
    'hesitacao',
    'constrangimento',
    'vergonha',
    'vulnerabilidade',
    'saudade',
    'nostalgia',
    'tristeza',
    'melancolia',
    'decepcao',
    'frustracao',
    'irritacao',
    'raiva',
    'indignacao',
    'impaciencia',
    'desanimo',
    'tedio',
    'cansaco',
    'apreensao',
    'medo',
    'inseguranca',
    'arrependimento',
    'culpa',
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

/** Artistic targets, not diagnoses or claims about executable voice/rig controls. */
type EmotionPresentation = {
  pad: [number, number, number];
  visual: string;
  vocal: string;
  deliveryPresetId: z.infer<typeof DeliveryPresetSchema>;
  avatarExpression: 'sorriso_discreto' | 'olhar_atento' | 'expressao_neutra';
};

const presentation = (
  pad: [number, number, number],
  visual: string,
  vocal: string,
  deliveryPresetId: EmotionPresentation['deliveryPresetId'] = 'neutro_claro_v1',
  avatarExpression: EmotionPresentation['avatarExpression'] = 'expressao_neutra',
): EmotionPresentation => ({
  pad,
  visual,
  vocal,
  deliveryPresetId,
  avatarExpression,
});

export const EMOTION_PRESENTATIONS: Record<
  Expression['emotion'],
  EmotionPresentation
> = {
  neutra: presentation([0, 0, 0], 'neutra', 'claro'),
  curiosidade: presentation(
    [0.15, 0.35, 0.15],
    'atenta',
    'interessado',
    'neutro_claro_v1',
    'olhar_atento',
  ),
  firmeza_calma: presentation([0, 0.1, 0.35], 'seria', 'firme-contido'),
  ironia_leve: presentation(
    [0.1, 0.2, 0.2],
    'sorriso-discreto',
    'seco-suave',
    'seco_suave_v1',
    'sorriso_discreto',
  ),
  irritacao_leve: presentation(
    [-0.25, 0.25, 0.2],
    'contrariada',
    'firme-contido',
  ),
  constrangimento_leve: presentation(
    [-0.1, 0.2, -0.15],
    'reserva-discreta',
    'hesitacao-breve',
    'hesitante_baixo_v1',
  ),
  preocupacao: presentation(
    [-0.2, 0.15, -0.1],
    'atenta-seria',
    'acolhedor-calmo',
    'acolhedor_calmo_v1',
  ),
  autocritica_leve: presentation([-0.1, 0, -0.1], 'seria', 'direto-contido'),
  calor_discreto: presentation([0.25, 0, 0.1], 'suave', 'calor-contido'),
  alegria_discreta: presentation(
    [0.3, 0.2, 0.1],
    'sorriso-discreto',
    'alegria-contida',
    'neutro_claro_v1',
    'sorriso_discreto',
  ),
  alegria: presentation(
    [0.65, 0.45, 0.25],
    'alegre',
    'alegre',
    'neutro_claro_v1',
    'sorriso_discreto',
  ),
  entusiasmo: presentation(
    [0.65, 0.7, 0.35],
    'animada',
    'energico',
    'neutro_claro_v1',
    'sorriso_discreto',
  ),
  divertimento: presentation(
    [0.55, 0.4, 0.2],
    'divertida',
    'brincalhao',
    'seco_suave_v1',
    'sorriso_discreto',
  ),
  orgulho: presentation([0.5, 0.3, 0.6], 'orgulhosa', 'seguro'),
  satisfacao: presentation(
    [0.5, 0.1, 0.3],
    'satisfeita',
    'satisfeito',
    'neutro_claro_v1',
    'sorriso_discreto',
  ),
  gratidao: presentation(
    [0.45, 0.1, 0.1],
    'grata',
    'calor-contido',
    'acolhedor_calmo_v1',
  ),
  afeto: presentation(
    [0.55, 0.05, 0.15],
    'afetuosa',
    'caloroso',
    'acolhedor_calmo_v1',
  ),
  ternura: presentation(
    [0.5, -0.1, 0.05],
    'terna',
    'suave',
    'acolhedor_calmo_v1',
  ),
  esperanca: presentation([0.4, 0.25, 0.15], 'esperancosa', 'encorajador'),
  alivio: presentation(
    [0.4, -0.35, 0.1],
    'aliviada',
    'relaxado',
    'acolhedor_calmo_v1',
  ),
  serenidade: presentation(
    [0.35, -0.4, 0.2],
    'serena',
    'calmo',
    'acolhedor_calmo_v1',
  ),
  surpresa: presentation(
    [0.05, 0.6, -0.1],
    'surpresa',
    'surpreso',
    'neutro_claro_v1',
    'olhar_atento',
  ),
  espanto: presentation(
    [-0.05, 0.8, -0.2],
    'espantada',
    'espantado',
    'neutro_claro_v1',
    'olhar_atento',
  ),
  admiracao: presentation(
    [0.5, 0.4, -0.05],
    'admirada',
    'admirado',
    'neutro_claro_v1',
    'olhar_atento',
  ),
  interesse: presentation(
    [0.2, 0.3, 0.15],
    'atenta',
    'interessado',
    'neutro_claro_v1',
    'olhar_atento',
  ),
  duvida: presentation(
    [-0.05, 0.2, -0.1],
    'questionadora',
    'ponderado',
    'hesitante_baixo_v1',
    'olhar_atento',
  ),
  confusao: presentation(
    [-0.15, 0.3, -0.25],
    'confusa',
    'incerto',
    'hesitante_baixo_v1',
  ),
  ceticismo: presentation(
    [-0.05, 0.15, 0.3],
    'cetica',
    'seco-suave',
    'seco_suave_v1',
    'olhar_atento',
  ),
  hesitacao: presentation(
    [-0.05, 0.1, -0.2],
    'hesitante',
    'hesitacao-breve',
    'hesitante_baixo_v1',
  ),
  constrangimento: presentation(
    [-0.2, 0.4, -0.3],
    'constrangida',
    'hesitante',
    'hesitante_baixo_v1',
  ),
  vergonha: presentation(
    [-0.35, 0.4, -0.45],
    'envergonhada',
    'reservado',
    'hesitante_baixo_v1',
  ),
  vulnerabilidade: presentation(
    [-0.15, 0.1, -0.4],
    'vulneravel',
    'baixo-sincero',
    'hesitante_baixo_v1',
  ),
  saudade: presentation(
    [-0.15, -0.1, -0.1],
    'saudosa',
    'suave-reflexivo',
    'acolhedor_calmo_v1',
  ),
  nostalgia: presentation(
    [0.05, -0.2, -0.05],
    'nostalgica',
    'reflexivo',
    'acolhedor_calmo_v1',
  ),
  tristeza: presentation(
    [-0.55, -0.3, -0.25],
    'triste',
    'baixo-contido',
    'acolhedor_calmo_v1',
  ),
  melancolia: presentation(
    [-0.4, -0.35, -0.2],
    'melancolica',
    'reflexivo-baixo',
    'acolhedor_calmo_v1',
  ),
  decepcao: presentation([-0.45, -0.1, -0.1], 'decepcionada', 'desapontado'),
  frustracao: presentation(
    [-0.5, 0.45, 0.1],
    'frustrada',
    'tenso-contido',
    'seco_suave_v1',
  ),
  irritacao: presentation(
    [-0.45, 0.45, 0.3],
    'irritada',
    'seco-firme',
    'seco_suave_v1',
  ),
  raiva: presentation(
    [-0.65, 0.75, 0.55],
    'brava',
    'firme-intenso',
    'seco_suave_v1',
  ),
  indignacao: presentation(
    [-0.55, 0.6, 0.6],
    'indignada',
    'firme-enfatico',
    'seco_suave_v1',
  ),
  impaciencia: presentation(
    [-0.3, 0.4, 0.35],
    'impaciente',
    'curto-seco',
    'seco_suave_v1',
  ),
  desanimo: presentation([-0.45, -0.4, -0.3], 'desanimada', 'baixo'),
  tedio: presentation([-0.2, -0.5, -0.1], 'entediada', 'pouca-energia'),
  cansaco: presentation([-0.2, -0.55, -0.2], 'cansada', 'baixo-lento'),
  apreensao: presentation(
    [-0.35, 0.45, -0.25],
    'apreensiva',
    'tenso',
    'hesitante_baixo_v1',
  ),
  medo: presentation(
    [-0.6, 0.65, -0.55],
    'assustada',
    'tenso-baixo',
    'hesitante_baixo_v1',
  ),
  inseguranca: presentation(
    [-0.3, 0.2, -0.4],
    'insegura',
    'incerto',
    'hesitante_baixo_v1',
  ),
  arrependimento: presentation(
    [-0.4, -0.05, -0.2],
    'arrependida',
    'sincero-baixo',
    'acolhedor_calmo_v1',
  ),
  culpa: presentation(
    [-0.5, 0.1, -0.35],
    'culpada',
    'baixo-sincero',
    'hesitante_baixo_v1',
  ),
};

export function describeExpressionContract() {
  return `Intenções: ${ExpressionSchema.shape.intent.options.join(', ')}. Emoções: ${ExpressionSchema.shape.emotion.options.join(', ')}. Intensidade contínua de 0 a 1: 0 ausente, 0.25 sutil, 0.5 perceptível, 0.75 forte, 1 máxima. Escolha a reação pelo contexto e acompanhe sua mudança após insistência, evidência ou reparo; intensidade alta é possível, não obrigatória. Os rótulos descrevem a atuação da persona, não o estado emocional do usuário.`;
}

export function describeDelivery(expression: Expression) {
  const presentation = EMOTION_PRESENTATIONS[expression.emotion];
  const deliveryPresetId =
    expression.intent === 'acolher' || expression.emotion === 'preocupacao'
      ? 'acolhedor_calmo_v1'
      : presentation.deliveryPresetId;

  return {
    deliveryPresetId: DeliveryPresetSchema.parse(deliveryPresetId),
    avatarExpression: presentation.avatarExpression,
  };
}
