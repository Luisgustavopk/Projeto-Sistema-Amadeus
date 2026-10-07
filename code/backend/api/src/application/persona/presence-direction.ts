import { readFileSync } from 'node:fs';
import type { PresenceKind } from '../voice/presence-controller.ts';

const document = readFileSync(
  new URL('./presence-turn-v1.md', import.meta.url),
  'utf8',
)
  .replace(/\r\n?/gu, '\n')
  .trim();
const greeting = document.indexOf('\n## greeting\n');
const initiative = document.indexOf('\n## initiative\n');

if (document.length > 3000 || greeting < 0 || initiative <= greeting) {
  throw new Error('Direção de iniciativa inválida.');
}

/** Application events select their own Markdown task, never user keywords. */
export function buildPresenceDirection(kind: PresenceKind) {
  return (
    document.slice(0, greeting) +
    (kind === 'greeting'
      ? document.slice(greeting, initiative)
      : document.slice(initiative)) +
    '\nTipo de iniciativa: ' +
    kind +
    '.'
  );
}
