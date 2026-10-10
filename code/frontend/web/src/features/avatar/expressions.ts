import { ACTING_CATALOG } from '../../../../assets/avatar/acting/generated/catalog.mjs';
export { ACTING_CATALOG };
export const QUICK_REACTIONS = Object.freeze({
  neutral: {
    label: 'Neutra',
    expression: null,
    text: 'Hm… então, por onde começamos?',
  },
  smile: {
    label: 'Sorriso',
    expression: 'Stanby Smile',
    text: 'Ah, você conseguiu. Sabia que valia a tentativa.',
  },
  angry: {
    label: 'Irritação',
    expression: 'Stanby Angry',
    text: 'Ai, sério…! Não me chama de Christina.',
  },
  blush: {
    label: 'Constrangimento',
    expression: 'Blush 1',
    text: 'Ah… obrigada. Não precisa fazer tanto alarde.',
  },
  embarrassed: {
    label: 'Vergonha',
    expression: 'Blush 2',
    text: 'Hã?! Você precisava falar isso agora?',
  },
  surprise: {
    label: 'Surpresa',
    expression: 'Stanby Surprised',
    text: 'Espera… você fez isso sozinho?',
  },
  sad: {
    label: 'Tristeza',
    expression: 'Stanby Sad',
    text: 'É… eu sinto muito. Posso ficar aqui um pouco.',
  },
  scared: {
    label: 'Medo',
    expression: 'Stanby Scared',
    text: 'Hã? Que barulho foi esse?',
  },
});

export const EMOTION_LABELS: Record<string, string> = {
  neutra: 'Neutra',
  curiosidade: 'Curiosidade',
  firmeza_calma: 'Firmeza calma',
  ironia_leve: 'Ironia leve',
  irritacao_leve: 'Irritação leve',
  constrangimento_leve: 'Constrangimento leve',
  preocupacao: 'Preocupação',
  autocritica_leve: 'Autocrítica leve',
  calor_discreto: 'Calor discreto',
  alegria_discreta: 'Alegria discreta',
  alegria: 'Alegria',
  entusiasmo: 'Entusiasmo',
  divertimento: 'Divertimento',
  orgulho: 'Orgulho',
  satisfacao: 'Satisfação',
  gratidao: 'Gratidão',
  afeto: 'Afeto',
  ternura: 'Ternura',
  esperanca: 'Esperança',
  alivio: 'Alívio',
  serenidade: 'Serenidade',
  surpresa: 'Surpresa',
  espanto: 'Espanto',
  admiracao: 'Admiração',
  interesse: 'Interesse',
  duvida: 'Dúvida',
  confusao: 'Confusão',
  ceticismo: 'Ceticismo',
  hesitacao: 'Hesitação',
  constrangimento: 'Constrangimento',
  vergonha: 'Vergonha',
  vulnerabilidade: 'Vulnerabilidade',
  saudade: 'Saudade',
  nostalgia: 'Nostalgia',
  tristeza: 'Tristeza',
  melancolia: 'Melancolia',
  decepcao: 'Decepção',
  frustracao: 'Frustração',
  irritacao: 'Irritação',
  raiva: 'Raiva',
  indignacao: 'Indignação',
  impaciencia: 'Impaciência',
  desanimo: 'Desânimo',
  tedio: 'Tédio',
  cansaco: 'Cansaço',
  apreensao: 'Apreensão',
  medo: 'Medo',
  inseguranca: 'Insegurança',
  arrependimento: 'Arrependimento',
  culpa: 'Culpa',
};
export function readableName(value: string) {
  const s = value.replace(/^kz_/, '').replaceAll('_', ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const REACTIONS: Readonly<
  Record<string, { label: string; expression: string | null; text: string }>
> = Object.freeze({
  ...QUICK_REACTIONS,
  ...Object.fromEntries(
    ACTING_CATALOG.expressions.map((e) => [
      e.Name,
      {
        label:
          e.kind === 'emotion'
            ? `${EMOTION_LABELS[e.emotion!] ?? readableName(e.emotion!)}${e.tier ? ' · ' + (e.tier === 'media' ? 'média' : e.tier) : ''}`
            : (e.desc ?? readableName(e.Name)),
        expression: e.Name,
        text: 'Hm…',
      },
    ]),
  ),
});

export type ReactionKey = keyof typeof REACTIONS;

export function previewDuration(text: string) {
  return Math.min(6500, Math.max(2200, text.length * 65));
}
