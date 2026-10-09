export const REACTIONS = Object.freeze({
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

export type ReactionKey = keyof typeof REACTIONS;

export function previewDuration(text: string) {
  return Math.min(6500, Math.max(2200, text.length * 65));
}
