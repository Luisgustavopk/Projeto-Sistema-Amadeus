import { readFileSync } from 'node:fs';

const document = readFileSync(
  new URL('./conversation-presence-v2.md', import.meta.url),
  'utf8',
).trim();

if (!document.startsWith('# Presença na conversa') || document.length > 4000) {
  throw new Error('Complemento de presença inválido.');
}

export const PERSONA_PRESENCE_REFERENCE = `<persona_conversation_presence>\n${document}\n</persona_conversation_presence>`;
