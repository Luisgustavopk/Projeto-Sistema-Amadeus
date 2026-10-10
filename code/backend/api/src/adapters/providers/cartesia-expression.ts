import {
  ExpressionSchema,
  type Expression,
} from '../../domain/persona/expression.ts';

// Native Sonic emotions. Intensity selects a delivery target, never volume.
// These targets still require listening tests with the configured voice.
const emotions: Record<Expression['emotion'], string> = {
  neutra: 'neutral',
  curiosidade: 'curious',
  firmeza_calma: 'confident',
  ironia_leve: 'ironic',
  irritacao_leve: 'frustrated',
  constrangimento_leve: 'hesitant',
  preocupacao: 'sympathetic',
  autocritica_leve: 'apologetic',
  calor_discreto: 'affectionate',
  alegria_discreta: 'content',
  alegria: 'happy',
  entusiasmo: 'excited',
  divertimento: 'happy',
  orgulho: 'proud',
  satisfacao: 'content',
  gratidao: 'grateful',
  afeto: 'affectionate',
  ternura: 'sympathetic',
  esperanca: 'anticipation',
  alivio: 'peaceful',
  serenidade: 'serene',
  surpresa: 'surprised',
  espanto: 'amazed',
  admiracao: 'amazed',
  interesse: 'curious',
  duvida: 'contemplative',
  confusao: 'confused',
  ceticismo: 'skeptical',
  hesitacao: 'hesitant',
  constrangimento: 'hesitant',
  vergonha: 'insecure',
  vulnerabilidade: 'insecure',
  saudade: 'wistful',
  nostalgia: 'nostalgic',
  tristeza: 'sad',
  melancolia: 'melancholic',
  decepcao: 'disappointed',
  frustracao: 'frustrated',
  irritacao: 'agitated',
  raiva: 'angry',
  indignacao: 'angry',
  impaciencia: 'frustrated',
  desanimo: 'dejected',
  tedio: 'bored',
  cansaco: 'tired',
  apreensao: 'anxious',
  medo: 'scared',
  inseguranca: 'insecure',
  arrependimento: 'apologetic',
  culpa: 'guilty',
};

export function cartesiaExpression(value: unknown) {
  const parsed = ExpressionSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const expression = parsed.data;
  let emotion =
    expression.intensity < 0.15 ? 'neutral' : emotions[expression.emotion];

  if (['raiva', 'indignacao', 'irritacao'].includes(expression.emotion)) {
    emotion =
      expression.intensity < 0.15
        ? 'neutral'
        : expression.intensity < 0.4
          ? 'frustrated'
          : expression.intensity < 0.75
            ? 'angry'
            : 'mad';
  }

  return { expression, generation_config: { emotion } };
}
