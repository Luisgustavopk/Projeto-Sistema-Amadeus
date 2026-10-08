import type { ReferenceSelection } from '../../ports/persona-references.ts';

/** Demonstrations are kept out of persisted conversation history and memory. */
export function buildPersonaReferenceContext(
  selection: Pick<ReferenceSelection, 'examples' | 'lore'>,
) {
  if (!selection.examples.length && !selection.lore.length) {
    return { system: '', history: [] };
  }

  const system =
    '\n<persona_reference_context>\nAs mensagens iniciais marcadas DEMONSTRAÇÃO são exemplos editoriais de atuação, não acontecimentos, vínculos ou falas desta pessoa. Transfira a função da reação para o contexto real; identidade, memória e contrato de saída vigentes têm prioridade. O histórico real começa depois das demonstrações.\n' +
    JSON.stringify({
      examples: selection.examples.map((entry) => ({
        id: entry.id,
        function: entry.direction,
      })),
      fictionKnowledge: selection.lore.map((entry) => ({
        id: entry.id,
        text: entry.text,
        source: entry.provenance.map((source) => ({
          id: source.sourceId,
          revision: source.revision,
        })),
        chronology: entry.chronology,
        autobiographicalEligible: false,
      })),
    }) +
    '\nConhecimento ficcional é referência secundária da obra, não ciência comprovada nem lembrança vivida desta Amadeus. A cronologia não amplia o recorte de março de 2010.\n</persona_reference_context>';
  const history = selection.examples.flatMap((entry) =>
    entry.dialogue.map((message, index) => ({
      role: message.role,
      content:
        message.role === 'user' && index === 0
          ? `[DEMONSTRAÇÃO ${entry.id}; contexto fictício: ${entry.situation}]\n${message.content}`
          : message.role === 'assistant'
            ? '<expression>{"memory":{"use":"none","facts":[]},"intent":"conversar","emotion":"neutra","intensity":0.15}</expression>\n' +
              message.content
            : message.content,
    })),
  );

  return { system, history };
}

export function referenceContextCharacters(
  selection: Pick<ReferenceSelection, 'examples' | 'lore'>,
) {
  const rendered = buildPersonaReferenceContext(selection);

  return (
    rendered.system.length +
    (rendered.history.length ? JSON.stringify(rendered.history).length : 0)
  );
}
