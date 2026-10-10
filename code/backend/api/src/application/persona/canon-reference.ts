import { readFileSync } from 'node:fs';

const source = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../../assets/persona/canon-conversation-v1.md'
    : './canon-conversation-v1.md',
  import.meta.url,
);
const reference = readFileSync(source, 'utf8').trim();

if (!reference.startsWith('# Atuação contextual') || reference.length > 3500) {
  throw new Error('Referência de atuação contextual inválida.');
}

export const PERSONA_CANON_REFERENCE = `<persona_canon_reference>\n${reference}\n</persona_canon_reference>`;
