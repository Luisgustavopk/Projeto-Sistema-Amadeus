import { PERSONA_CONVERSATION_REFERENCE } from './conversation-reference.ts';

/** Compatibility export; the Markdown direction is included once in the prompt. */
export const DIALOGUE_DIRECTION = PERSONA_CONVERSATION_REFERENCE.split(
  '## Conversa e reparo\n',
)[1]!
  .split('\n## Exemplos contextuais')[0]!
  .trim();
