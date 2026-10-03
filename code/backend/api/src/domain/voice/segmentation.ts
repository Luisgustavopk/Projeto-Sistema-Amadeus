import { VoiceInputError } from '../errors/voice.ts';

export function segmentSpeech(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const result: string[] = [];
  let remaining = normalized;

  while (remaining && result.length < 24) {
    let end = Math.min(220, remaining.length);

    if (end < remaining.length) {
      const sentence = remaining.slice(0, end).match(/[.!?](?:\s|$)/g);
      const punctuation = Math.max(
        remaining.lastIndexOf('. ', end),
        remaining.lastIndexOf('? ', end),
        remaining.lastIndexOf('! ', end),
      );
      const word = remaining.lastIndexOf(' ', end);
      end =
        sentence && punctuation >= 40 ? punctuation + 1 : word > 0 ? word : end;
    }

    result.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining) {
    throw new VoiceInputError(
      'Resposta excede o limite de 24 segmentos de voz.',
    );
  }

  return result.filter(Boolean);
}
