import { readFileSync } from 'node:fs';

const direction = readFileSync(
  new URL('./expressive-direction-v1.md', import.meta.url),
  'utf8',
).trim();

if (!direction || direction.length > 2000) {
  throw new Error('Direção expressiva excede o limite operacional.');
}

export const PERSONA_EXPRESSIVE_REFERENCE = `<persona_expressive_direction>\n${direction}\n</persona_expressive_direction>`;
