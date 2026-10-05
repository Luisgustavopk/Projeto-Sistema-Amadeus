import type { DataClass } from '../../domain/providers/model.ts';
import { normalizeMemory, type MemoryFact } from '../../domain/memory/model.ts';

const STOP_WORDS = new Set(
  'a o as os de da do das dos um uma e em para por com que qual quais como voce eu meu minha ele ela isso esse essa sobre'.split(
    ' ',
  ),
);
const HUBS = new Set(['usuario']);

export function memoryTerms(text: string) {
  return [
    ...new Set(
      normalizeMemory(text)
        .split(' ')
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    ),
  ].slice(0, 24);
}

export function memoryEligible(
  fact: Pick<MemoryFact, 'dataClass' | 'permission'>,
  dataClass: DataClass,
) {
  if (dataClass === 'local-only') {
    return true;
  }

  return (
    fact.permission === 'eligible' &&
    fact.dataClass !== 'local-only' &&
    (dataClass === 'personal' || fact.dataClass === 'synthetic')
  );
}

export function selectRelevantFacts(
  facts: MemoryFact[],
  text: string,
  dataClass: DataClass,
  budget = 1800,
) {
  const query = new Set(memoryTerms(text));
  const candidates = facts.filter(
    (fact) =>
      fact.status === 'confirmed' &&
      (fact.expiresAt === null || fact.expiresAt > Date.now()) &&
      memoryEligible(fact, dataClass),
  );

  const score = (fact: MemoryFact) => {
    const words = new Set(
      normalizeMemory(
        fact.text + ' ' + fact.category + ' ' + JSON.stringify(fact.relation),
      ).split(' '),
    );

    return [...query].reduce((sum, word) => sum + Number(words.has(word)), 0);
  };

  const direct = candidates
    .map((fact) => ({ fact, score: score(fact) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.fact.updatedAt - a.fact.updatedAt)
    .slice(0, 8);
  const selectedIds = new Set(direct.map((entry) => entry.fact.id));
  const graph = [...direct];
  let frontier = direct.map((entry) => entry.fact);

  // At most two hops; generic subjects must not pull the user's entire graph.
  for (let depth = 0; depth < 2 && graph.length < 12; depth++) {
    const entities = new Set(
      frontier
        .flatMap((fact) =>
          fact.relation
            ? [
                normalizeMemory(fact.relation.subject),
                normalizeMemory(fact.relation.object),
              ]
            : [],
        )
        .filter((entity) => !HUBS.has(entity)),
    );
    frontier = [];

    for (const fact of candidates) {
      if (selectedIds.has(fact.id) || !fact.relation) {
        continue;
      }

      if (
        entities.has(normalizeMemory(fact.relation.subject)) ||
        entities.has(normalizeMemory(fact.relation.object))
      ) {
        graph.push({ fact, score: 0 });
        frontier.push(fact);
        selectedIds.add(fact.id);
      }

      if (graph.length >= 12) {
        break;
      }
    }
  }

  const selected: {
    id: string;
    version: number;
    text: string;
    relation: MemoryFact['relation'];
    dataClass: DataClass;
    kind: MemoryFact['kind'];
    expiresAt: number | null;
  }[] = [];

  for (const { fact } of graph) {
    const entry = {
      id: fact.id,
      version: fact.version,
      text: fact.text,
      relation: fact.relation,
      dataClass: fact.dataClass,
      kind: fact.kind,
      expiresAt: fact.expiresAt,
    };

    if (JSON.stringify([...selected, entry]).length <= budget) {
      selected.push(entry);
    }
  }

  return selected;
}
