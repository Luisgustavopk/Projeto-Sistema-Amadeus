import { readFileSync } from 'node:fs';
import { z } from 'zod';

const document = readFileSync(
  new URL('./input-repair-v1.md', import.meta.url),
  'utf8',
);
const phrases = z
  .array(z.string().trim().min(1).max(120))
  .min(2)
  .parse(JSON.parse(document.match(/```json\s*([\s\S]*?)```/u)?.[1] ?? ''));

/** Per-call variation changes wording only, never the semantic decision. */
export function createInputRepair() {
  let next = 0;

  return () => phrases[next++ % phrases.length]!;
}
