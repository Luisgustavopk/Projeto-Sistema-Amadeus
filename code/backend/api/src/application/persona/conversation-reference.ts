import { readFileSync } from 'node:fs';

export const MAX_CONVERSATION_DIRECTION_CHARS = 5000;
const sections = [
  'Identidade e prioridade',
  'Honestidade e ficção',
  'Conversa e reparo',
  'Exemplos contextuais',
  'Texto falável',
] as const;

export function validateConversationDirection(markdown: string) {
  const text = markdown.replace(/\r\n?/g, '\n').trim();

  if (
    !text.startsWith('# Direção operacional de conversa') ||
    text.length > MAX_CONVERSATION_DIRECTION_CHARS ||
    /(?:^|\n)(?:EXPRESSÃO|FORMATO):|<\/?expression>/u.test(text) ||
    sections.some((section) => !text.includes(`\n## ${section}\n`))
  ) {
    throw new Error(
      'Direção de conversa inválida, incompleta ou acima de 5000 caracteres.',
    );
  }

  return text;
}

const source = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../../assets/persona/conversation-directions-v1.md'
    : './conversation-directions-v1.md',
  import.meta.url,
);

export const PERSONA_CONVERSATION_REFERENCE = validateConversationDirection(
  readFileSync(source, 'utf8'),
);
