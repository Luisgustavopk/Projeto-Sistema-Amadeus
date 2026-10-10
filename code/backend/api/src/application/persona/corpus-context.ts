import type { ReferenceSelection } from '../../ports/persona-references.ts';

/** Demonstrations are kept out of persisted conversation history and memory. */
export function buildPersonaReferenceContext(
  selection: Pick<ReferenceSelection, 'examples' | 'lore'>,
) {
  if (!selection.examples.length && !selection.lore.length) {
    return { system: '', history: [] };
  }

  const system =
    '\n<persona_reference_context>\nCada exemplo abaixo é uma cena editorial independente e fictícia. Transfira a função da reação para o contexto real. As pessoas, objetos, acontecimentos e falas desses exemplos pertencem somente à demonstração. As mensagens de conversa que seguem este contexto contêm o histórico real. Identidade, memória e contrato de saída vigentes têm prioridade.\n' +
    JSON.stringify({
      examples: selection.examples.map((entry) => ({
        id: entry.id,
        function: entry.direction,
        situation: entry.situation,
        dialogue: entry.dialogue,
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

  return { system, history: [] };
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
