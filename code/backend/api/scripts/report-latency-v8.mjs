import { readFile, writeFile } from 'node:fs/promises';
import {
  fingerprint,
  quantiles,
} from '../src/evaluation/persona/diagnostics.ts';
const directory = new URL(
  '../data/refinement/latency-v8-remainder/',
  import.meta.url,
);
const authors = JSON.parse(
  await readFile(new URL('authors.json', directory), 'utf8'),
);
const ledger = JSON.parse(
  await readFile(new URL('quality-v2-1-budget.json', directory), 'utf8'),
);
let judge = null;
try {
  judge = JSON.parse(await readFile(new URL('jev.json', directory), 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const arms = {};
const q = (values) => quantiles(values.filter((v) => typeof v === 'number'));
for (const model of ['llama', 'deepseek'])
  for (const arm of ['baseline', 'isolated', 'parallel']) {
    const cases = authors.cases.filter(
      (c) => c.model === model && c.arm === arm && c.complete,
    );
    const turns = cases.flatMap((c) => c.turns);
    const counts = (field) =>
      Object.fromEntries(
        [
          ...new Set(turns.map((t) => t.expression?.[field]).filter(Boolean)),
        ].map((label) => [
          label,
          turns.filter((t) => t.expression?.[field] === label).length,
        ]),
      );
    const calls = authors.calls.filter(
      (c) =>
        c.purpose.startsWith('author:') &&
        turns.some((t) => t.callIds.includes(c.id)),
    );
    arms[`${model}:${arm}`] = {
      conversations: cases.length,
      turns: turns.length,
      words: q(turns.map((t) => t.diagnostics.words)),
      sentences: q(turns.map((t) => t.diagnostics.sentences)),
      questionsPerTurn: turns.length
        ? turns.reduce((s, t) => s + t.diagnostics.questions, 0) / turns.length
        : null,
      firstRawMs: q(turns.map((t) => t.firstRawTextMs)),
      firstSpeechMs: q(turns.map((t) => t.firstSpeechTextMs)),
      firstUsableMs: q(turns.map((t) => t.firstUsableTextMs)),
      generationMs: q(turns.map((t) => t.authorCompletedMs)),
      retrievalMs: q(turns.map((t) => t.retrievalMs)),
      headerLagMs: q(
        turns
          .filter(
            (t) =>
              t.firstSpeechTextMs != null && t.raw.includes('</expression>'),
          )
          .map((t) => t.firstSpeechTextMs - t.firstRawTextMs),
      ),
      speechToUsableMs: q(
        turns
          .filter(
            (t) => t.firstSpeechTextMs != null && t.firstUsableTextMs != null,
          )
          .map((t) => t.firstUsableTextMs - t.firstSpeechTextMs),
      ),
      metadataReadyLagMs: q(
        turns
          .filter((t) => t.expression?.valid && t.firstUsableTextMs != null)
          .map((t) => t.expression.readyMs - t.firstUsableTextMs),
      ),
      invalidMetadata: turns.filter((t) => !t.expression?.valid).length,
      observerErrors: turns.filter((t) => t.observationResult?.error).length,
      emotions: counts('emotion'),
      intents: counts('intent'),
      intensity: q(turns.map((t) => t.expression?.intensity)),
      exampleCopy: turns.filter((t) => t.diagnostics.exampleCopy.matched.length)
        .length,
      recentCopy: turns.filter((t) => t.diagnostics.recentCopy.matched.length)
        .length,
      inputTokens: calls.reduce((s, c) => s + (c.usage?.prompt_tokens ?? 0), 0),
      outputTokens: calls.reduce(
        (s, c) => s + (c.usage?.completion_tokens ?? 0),
        0,
      ),
      cachedInputTokens: calls.reduce(
        (s, c) => s + (c.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        0,
      ),
      authorCost: calls.reduce((s, c) => s + (c.usage?.cost ?? 0), 0),
    };
  }
const summary = {
  manifestHash: authors.manifestHash,
  completeConversations: authors.cases.filter((c) => c.complete).length,
  authorCalls: authors.calls.filter((c) => c.purpose.startsWith('author:'))
    .length,
  observerCalls: authors.calls.filter((c) => c.purpose.startsWith('observer:'))
    .length,
  stopped: authors.stopped,
  errors: authors.cases.flatMap((c) => c.turns.flatMap((t) => t.errors)),
  capUsd: ledger.maxUsd,
  committedUsd: ledger.committedUsd,
  priorRoundUsd: 0.13292911599999996,
  aggregateUsd: ledger.committedUsd + 0.13292911599999996,
  reportedAuthorAndObserverUsd: authors.calls.reduce(
    (s, c) => s + (c.usage?.cost ?? 0),
    0,
  ),
  judgeCalls: judge?.calls.length ?? 0,
  judgeReportedUsd:
    judge?.calls.reduce((s, c) => s + (c.usage?.cost ?? 0), 0) ?? 0,
  unknownCalls: authors.calls
    .filter((c) => c.usage?.cost == null)
    .map((c) => c.id),
  arms,
};
await writeFile(
  new URL('summary.json', directory),
  JSON.stringify(summary, null, 2),
);
const groups = [...new Set(authors.cases.map((c) => c.groupKey))];
const cards = [];
for (const group of groups) {
  const cases = authors.cases.filter((c) => c.groupKey === group);
  const max = Math.max(...cases.map((c) => c.turns.length));
  for (let index = 0; index < max; index++) {
    const options = cases
      .filter((c) => c.turns[index])
      .map((c) => ({
        key: c.key,
        model: c.model,
        arm: c.arm,
        sample: c.sample,
        reply: c.turns[index].assistant,
        context: c.turns[index].history,
        errors: c.turns[index].errors,
        expression: c.turns[index].expression,
      }))
      .sort((a, b) =>
        fingerprint([group, index, a.key]).localeCompare(
          fingerprint([group, index, b.key]),
        ),
      );
    cards.push({
      id: fingerprint([group, index, options]).slice(0, 12),
      group,
      turn: index + 1,
      current: cases.find((c) => c.turns[index])?.turns[index].user,
      options: Object.fromEntries(
        options.map((o, i) => [String.fromCharCode(65 + i), o]),
      ),
    });
  }
}
await writeFile(
  new URL('all-cards-private.json', directory),
  JSON.stringify(cards, null, 2),
);
const complete = cards
  .map(
    (c, i) =>
      `## Item ${i + 1} — ${c.id}\n\nConversa ${c.group}, turno ${c.turn}.\n\nPessoa: ${c.current}\n\n` +
      Object.entries(c.options)
        .map(
          ([letter, o]) =>
            `### ${letter}\n\n${o.context.length ? o.context.map((m) => `${m.role === 'user' ? 'Pessoa' : 'Amadeus'}: ${m.content}`).join('\n\n') : '(Sem histórico anterior.)'}\n\n**Resposta:** ${o.reply || '(Sem resposta utilizável.)'}\n\nInterlocução: __ · Fatos: __ · Continuidade: __ · Persona: __ · Reação e recomposição: __ · Expressividade: __\n`,
        )
        .join('\n') +
      '\nPreferência: __ (letras / empate / nenhuma / incerto).\n',
  )
  .join('\n');
await writeFile(
  new URL('ficha-cega-completa.md', directory),
  `# Revisão cega — atuação e latência v8\n\n${cards.length} itens; ${cards.reduce((s, c) => s + Object.keys(c.options).length, 0)} respostas, todas as amostras disponíveis. A–F mudam por item; cada opção possui histórico próprio. Sem nomes dos modelos, braços, metadados ou notas do Jev. Julgue a reação pelo contexto; interjeições não são obrigatórias.\n\n${complete}`,
);
await writeFile(
  new URL('transcricoes-completas.md', directory),
  '# Transcrições identificadas — diagnóstico\n\n' +
    authors.cases
      .map(
        (c) =>
          `## ${c.key}\n\n` +
          c.turns
            .map(
              (t) =>
                `Pessoa: ${t.user}\n\nAmadeus: ${t.assistant}\n\nExpressão: ${JSON.stringify(t.expression)}\n\nPrimeiro texto: ${t.firstUsableTextMs} ms; erros: ${JSON.stringify(t.errors)}.\n`,
            )
            .join('\n'),
      )
      .join('\n'),
);
await writeFile(
  new URL('ficha-expressoes.md', directory),
  '# Revisão separada dos metadados — v8\n\nUse depois de avaliar o texto na ficha cega. Os mesmos itens e letras são preservados. Validade de schema não comprova adequação emocional; a classificação paralela observa apenas o primeiro segmento. Nenhuma proposta foi aplicada à voz.\n\n' +
    cards
      .map(
        (c, i) =>
          `## Item ${i + 1} — ${c.id}\n\nPessoa: ${c.current}\n\n` +
          Object.entries(c.options)
            .map(
              ([letter, o]) =>
                `### ${letter}\n\nResposta: ${o.reply}\n\nProposta: ${JSON.stringify(o.expression)}\n\nIntenção adequada: __ · Emoção adequada: __ · Intensidade proporcional: __ · Mudança em relação ao turno anterior: __\n`,
            )
            .join('\n'),
      )
      .join('\n'),
);
if (judge) {
  const manifest = JSON.parse(
    await readFile(new URL('judge-manifest.json', directory), 'utf8'),
  );
  const pairs = manifest.frozen.fresh;
  await writeFile(
    new URL('ficha-jev-pares-novos.md', directory),
    '# Revisão pessoal — pares novos para o Jev\n\n' +
      `${pairs.length} pares inéditos nesta avaliação, somente do caminho de fala sem cabeçalho. Compare antes de ler as notas do juiz. A/B mudam por item; cada resposta tem seu próprio histórico. Este arquivo não contém gabarito nem nomes dos modelos.\n\n` +
      pairs
        .map(
          (p, i) =>
            `## Item ${i + 1} — ${p.id}\n\nPessoa: ${p.current}\n\n` +
            Object.entries(p.options)
              .map(
                ([letter, o]) =>
                  `### ${letter}\n\nHistórico:\n\n${o.context || '(Sem histórico anterior.)'}\n\nResposta: ${o.reply}\n\nAdequação: __ · Persona: __ · Expressividade: __\n`,
              )
              .join('\n') +
            '\nPreferência: __ (A / B / empate / nenhuma / incerto). Motivo: __\n',
        )
        .join('\n'),
  );
}
console.log(
  JSON.stringify(
    {
      complete: summary.completeConversations,
      authors: summary.authorCalls,
      observers: summary.observerCalls,
      judge: summary.judgeCalls,
      aggregateUsd: summary.aggregateUsd,
      cards: cards.length,
      replies: cards.reduce((s, c) => s + Object.keys(c.options).length, 0),
      arms,
    },
    null,
    2,
  ),
);
