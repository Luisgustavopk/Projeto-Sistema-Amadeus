import type { DataClass } from '../../domain/providers/model.ts';
import { normalizeMemory, type MemoryFact } from '../../domain/memory/model.ts';

const HUBS = new Set(['usuario']);

export function memoryContextSources(fact: MemoryFact) {
  return fact.origin === 'user'
    ? []
    : fact.sources.filter((source) => source.contextValid !== false);
}

export function memoryTerms(text: string) {
  const normalized = normalizeMemory(text);

  return [
    ...new Set(normalized.split(' ').filter((word) => word.length > 2)),
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
  semanticScores: ReadonlyMap<string, number> = new Map(),
  semanticAvailable = false,
  focused = false,
) {
  const query = new Set(memoryTerms(text));
  const candidates = facts.filter(
    (fact) =>
      fact.status === 'confirmed' &&
      (fact.expiresAt === null || fact.expiresAt > Date.now()) &&
      memoryEligible(fact, dataClass),
  );

  const factWords = new Map(
    candidates.map((fact) => [
      fact.id,
      new Set(
        normalizeMemory(fact.text + ' ' + JSON.stringify(fact.relation)).split(
          ' ',
        ),
      ),
    ]),
  );
  const frequencies = new Map(
    [...query].map((word) => [
      word,
      candidates.filter((fact) => factWords.get(fact.id)!.has(word)).length,
    ]),
  );

  const score = (fact: MemoryFact) => {
    const words = new Set(
      normalizeMemory(fact.text + ' ' + JSON.stringify(fact.relation)).split(
        ' ',
      ),
    );

    // Corpus frequency reduces generic word matches without language-specific
    // stop-word lists. Semantic scores have priority in the hybrid ranking.
    const lexical = [...query].reduce(
      (sum, word) =>
        sum + (words.has(word) ? 1 / (frequencies.get(word) ?? 1) : 0),
      0,
    );

    if (semanticScores.has(fact.id)) {
      return 100 + semanticScores.get(fact.id)! + lexical * 0.001;
    }

    // A common word such as a pronoun must not undo a semantic rejection.
    // Exact names/codes/phrases still work, with no per-language word list.
    const literal = normalizeMemory(text);

    return !semanticAvailable ||
      (literal.length >= 4 && normalizeMemory(fact.text).includes(literal))
      ? lexical
      : 0;
  };

  const ranked = candidates
    .map((fact) => ({ fact, score: score(fact) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.fact.updatedAt - a.fact.updatedAt)
    .slice(0, 8);
  const third = ranked[2];
  const direct =
    focused && third
      ? ranked.filter(
          (entry, index) =>
            index < 3 ||
            (semanticScores.get(entry.fact.id) ?? entry.score) >=
              (semanticScores.get(third.fact.id) ?? third.score) * 0.9,
        )
      : ranked;
  const maximumFacts = focused ? 8 : 12;
  const selectedIds = new Set(direct.map((entry) => entry.fact.id));
  const graph = [...direct];
  let frontier = direct.map((entry) => entry.fact);

  const directSources = new Set(
    frontier.flatMap((fact) =>
      memoryContextSources(fact).map((source) => source.turnId),
    ),
  );

  // Sharing evidence means related context, not proof of a relationship.
  // Add only one hop from direct matches, never the raw source utterance.
  let complements = 0;

  for (const fact of candidates) {
    if (graph.length >= maximumFacts) {
      break;
    }

    if (
      !selectedIds.has(fact.id) &&
      (!focused || complements < 2) &&
      memoryContextSources(fact).some((source) =>
        directSources.has(source.turnId),
      )
    ) {
      graph.push({ fact, score: 0 });
      selectedIds.add(fact.id);
      complements++;
    }
  }

  // At most two hops; generic subjects must not pull the user's entire graph.
  for (let depth = 0; depth < 2 && graph.length < maximumFacts; depth++) {
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
      if (
        selectedIds.has(fact.id) ||
        !fact.relation ||
        (focused && score(fact) <= 0)
      ) {
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

      if (graph.length >= maximumFacts) {
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
