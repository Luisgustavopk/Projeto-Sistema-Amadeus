import { readFileSync } from 'node:fs';
import type { PresenceKind } from '../voice/presence-controller.ts';
import type { StoredTurn } from '../../ports/call-history-repository.ts';
import { buildHistoryContext } from '../voice/history-context.ts';

const document = readFileSync(
  new URL('./presence-turn-v2.md', import.meta.url),
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
export function buildPresenceDirection(
  kind: PresenceKind,
  history: StoredTurn[] = [],
) {
  const anchor =
    kind === 'initiative'
      ? '\n<presence_anchor>\n' +
        JSON.stringify({
          source: 'current-conversation-user-turns',
          turns: buildHistoryContext(
            history
              .filter((turn) => !turn.initiativeKind && turn.userText.trim())
              .slice(-3),
            1200,
            true,
          ),
          doesNotProveReadingOrHearing: true,
        }) +
        '\n</presence_anchor>'
      : '';

  return (
    document.slice(0, greeting) +
    (kind === 'greeting'
      ? document.slice(greeting, initiative)
      : document.slice(initiative)) +
    anchor +
    '\nTipo de iniciativa: ' +
    kind +
    '.'
  );
}
