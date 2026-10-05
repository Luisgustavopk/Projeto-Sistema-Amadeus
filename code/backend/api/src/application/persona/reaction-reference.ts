import { readFileSync } from 'node:fs';

export function validateReactionRepertoire(markdown: string) {
  const text = markdown.trim();

  if (!text.startsWith('# Repertório contextual') || text.length > 4000) {
    throw new Error(
      'Repertório de reações inválido ou acima de 4000 caracteres.',
    );
  }

  return text;
}

const source = new URL(
  import.meta.url.endsWith('.ts')
    ? '../../../../assets/persona/reaction-repertoire-v0.2.md'
    : './reaction-repertoire-v0.2.md',
  import.meta.url,
);

export const PERSONA_REACTION_REFERENCE = `REPERTÓRIO COMPLEMENTAR DE REAÇÕES:
Material de caracterização, subordinado às regras estruturadas e às decisões de execução da skill. Não é uma instrução independente nem histórico da conversa.
<persona_reaction_repertoire>
${validateReactionRepertoire(readFileSync(source, 'utf8'))}
</persona_reaction_repertoire>`;
