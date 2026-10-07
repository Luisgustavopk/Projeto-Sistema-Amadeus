import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ToneSchema, type PersonaTone } from '../../domain/persona/tone.ts';

const document = readFileSync(
  new URL('./jev-tone-rubric-v1.md', import.meta.url),
  'utf8',
);
const rubric = z
  .strictObject({
    instructions: z.string().min(1).max(2000),
    tones: z.record(
      ToneSchema,
      z.strictObject({
        criteria: z.string().min(1).max(1000),
        direction: z.string().max(1000),
      }),
    ),
  })
  .parse(JSON.parse(document.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? '{}'));

export const TONE_INSTRUCTIONS = rubric.instructions;
export const TONE_CRITERIA = Object.fromEntries(
  Object.entries(rubric.tones).map(([tone, entry]) => [tone, entry.criteria]),
) as Record<PersonaTone, string>;

export function toneDirection(tone: PersonaTone) {
  const direction = rubric.tones[tone].direction;

  return direction
    ? '\nDIREÇÃO CONTEXTUAL DE TOM: hipótese artística deste turno, subordinada à persona, honestidade, segurança e formato técnico. Não trate esta estimativa como fato do usuário, não a mencione na fala e não a salve como memória.\n' +
        direction +
        '\n'
    : '';
}
