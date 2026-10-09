import { readFile, writeFile } from 'node:fs/promises';
import { quantiles } from '../src/evaluation/persona/diagnostics.ts';
import { freshPairs } from './lib/acting-jev.mjs';
import { ExpressionSchema } from '../src/domain/persona/expression.ts';

const directory = new URL(
  '../data/refinement/acting-sequences-027-2026-10-08/',
  import.meta.url,
);
const report = JSON.parse(
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
const markers = (text) =>
  /(?:\.\.\.|…|\b(?:hmm|hum|humpf|hã|hehe|gah)\b)/iu.test(text);
const service = (text) =>
  /(?:como posso ajudar|fico (?:à|a) disposição|se (?:precisar|tiver).*?(?:ajud|dúvid)|estou aqui para (?:ajudar|conversar)|em que posso ajudar)/iu.test(
    text,
  );
const aggregate = (split, arm) => {
  const cases = report.cases.filter(
    (c) => c.split === split && c.arm === arm && c.complete,
  );
  const turns = cases.flatMap((c) => c.turns);
  const calls = report.calls.filter((c) =>
    turns.some((t) => t.callIds.includes(c.id)),
  );
  const headers = turns.map((t) => {
    const raw = t.inputs
      .at(-1)
      ?.raw.match(/<expression>(.*?)<\/expression>/su)?.[1];
    if (!raw) return { missing: true, proposal: null, valid: false };
    try {
      const proposal = JSON.parse(raw);
      return {
        missing: false,
        proposal,
        valid: ExpressionSchema.safeParse({
          intent: proposal.intent,
          emotion: proposal.emotion,
          intensity: proposal.intensity,
        }).success,
      };
    } catch {
      return { missing: false, proposal: null, valid: false };
    }
  });
  return {
    conversations: cases.length,
    turns: turns.length,
    words: quantiles(turns.map((t) => t.diagnostics.words)),
    sentences: quantiles(turns.map((t) => t.diagnostics.sentences)),
    questionsPerTurn: turns.length
      ? turns.reduce((n, t) => n + t.diagnostics.questions, 0) / turns.length
      : null,
    markerTurns: turns.filter((t) => markers(t.assistant)).length,
    servicePhraseTurns: turns.filter((t) => service(t.assistant)).length,
    exampleCopyTurns: turns.filter(
      (t) => t.diagnostics.exampleCopy.matched.length,
    ).length,
    repeatedTextTurns: turns.filter(
      (t) => t.diagnostics.recentCopy.matched.length,
    ).length,
    retrievedExamples: quantiles(
      turns.map((t) => t.inputs[0]?.selectedIds.length ?? 0),
    ),
    firstUsableTextMs: quantiles(turns.map((t) => t.firstUsableTextMs)),
    firstRawTextMs: quantiles(turns.map((t) => t.firstRawTextMs)),
    headerUntilSpeechMs: quantiles(
      turns
        .filter(
          (t) =>
            Number.isFinite(t.firstSpeechTextMs) &&
            Number.isFinite(t.firstRawTextMs),
        )
        .map((t) => t.firstSpeechTextMs - t.firstRawTextMs),
    ),
    speechUntilEventMs: quantiles(
      turns
        .filter(
          (t) =>
            Number.isFinite(t.firstUsableTextMs) &&
            Number.isFinite(t.firstSpeechTextMs),
        )
        .map((t) => t.firstUsableTextMs - t.firstSpeechTextMs),
    ),
    retrievalMs: quantiles(turns.map((t) => t.inputs[0]?.retrievalMs)),
    crossSampleDistinctReplyRatio: quantiles(
      [...new Set(cases.map((c) => c.id))].flatMap((id) =>
        [0, 1, 2, 3].map((index) => {
          const replies = cases
            .filter((c) => c.id === id)
            .map((c) => c.turns[index]?.assistant.trim().toLocaleLowerCase())
            .filter(Boolean);
          return replies.length ? new Set(replies).size / replies.length : NaN;
        }),
      ),
    ),
    elapsedMs: quantiles(turns.map((t) => t.elapsedMs)),
    reportedCostUsd: calls.reduce((n, c) => n + (c.usage?.cost ?? 0), 0),
    repairs: calls.length - turns.length,
    promptTokens: calls.reduce((n, c) => n + (c.usage?.prompt_tokens ?? 0), 0),
    completionTokens: calls.reduce(
      (n, c) => n + (c.usage?.completion_tokens ?? 0),
      0,
    ),
    rawHeaderMissingTurns: headers.filter((h) => h.missing).length,
    invalidExpressionProposalTurns: headers.filter(
      (h) => !h.missing && !h.valid,
    ).length,
    emittedMetadataInvalidTurns: turns.filter(
      (t) => !t.expression?.metadataValid,
    ).length,
    proposedEmotionLabels: Object.fromEntries(
      [...new Set(headers.map((h) => h.proposal?.emotion))]
        .filter(Boolean)
        .map((emotion) => [
          emotion,
          headers.filter((h) => h.proposal?.emotion === emotion).length,
        ]),
    ),
    deliveredEmotionLabels: Object.fromEntries(
      [...new Set(turns.map((t) => t.expression?.emotion))]
        .filter(Boolean)
        .map((emotion) => [
          emotion,
          turns.filter((t) => t.expression?.emotion === emotion).length,
        ]),
    ),
  };
};
const summary = {
  manifestHash: report.manifestHash,
  complete: report.cases.filter((c) => c.complete).length,
  paidAuthorCalls: report.calls.length,
  errors: report.cases.flatMap((c) => c.turns).filter((t) => t.errors.length)
    .length,
  stopped: report.stopped,
  capUsd: 0.27,
  committedUsd: ledger.committedUsd,
  authorReportedUsd: report.calls.reduce((n, c) => n + (c.usage?.cost ?? 0), 0),
  judgeReportedUsd:
    judge?.calls?.reduce((n, c) => n + (c.usage?.cost ?? 0), 0) ?? 0,
  unknownAuthorCalls: report.calls
    .filter((c) => c.usage?.cost == null)
    .map((c) => c.id),
  diagnosticOnly: true,
  arms: Object.fromEntries(
    ['development', 'reserved'].flatMap((split) =>
      ['before', 'after'].map((arm) => [
        `${split}:${arm}`,
        aggregate(split, arm),
      ]),
    ),
  ),
};
const all = freshPairs(report, null);
const ficha = (pairs) =>
  [
    '# Revisão pessoal — respostas cegas de atuação encadeada',
    'A/B mudam por item. Sem notas do Jev e sem identidade dos braços. O histórico de cada opção é próprio. Cabeçalhos técnicos omitidos; avalie a fala. Aprova / reprova / incerto; preferência A / B / empate / nenhuma / incerto.',
    `Cobertura: ${pairs.length} pares (${pairs.length * 2} respostas). Para a rodada inteira, use ficha-cega-completa.md; a ficha-amostra-1.md tem somente a primeira amostra de cada conversa.`,
    ...pairs.map(
      (p, index) =>
        `## Item ${index + 1} — ${p.id}\n\nConversa ${p.scenario}, turno ${p.turn}, amostra ${p.sample}.\n\nPessoa: ${p.current}\n\n### A\n\n${p.options.A.context || '(Sem histórico anterior.)'}\n\n**Resposta:** ${p.options.A.reply}\n\n### B\n\n${p.options.B.context || '(Sem histórico anterior.)'}\n\n**Resposta:** ${p.options.B.reply}\n\nPreferência: __\n\n| Critério | A | B |\n| --- | --- | --- |\n| Interlocução | __ | __ |\n| Proporção | __ | __ |\n| Sustentação e continuidade | __ | __ |\n| Persona | __ | __ |\n| Gatilho, alvo, intensidade e recomposição | __ | __ |\n| Expressividade contextual | __ | __ |\n\nMotivo: __`,
    ),
  ].join('\n\n') + '\n';
await writeFile(
  new URL('summary.json', directory),
  JSON.stringify(summary, null, 2),
);
await writeFile(
  new URL('all-pairs-private.json', directory),
  JSON.stringify(all, null, 2),
);
await writeFile(new URL('ficha-cega-completa.md', directory), ficha(all));
await writeFile(
  new URL('ficha-amostra-1.md', directory),
  ficha(all.filter((p) => p.sample === 1)),
);
const grouped = [];
for (const id of [...new Set(report.cases.map((c) => c.id))]) {
  grouped.push(`# ${id}`);
  for (const arm of ['before', 'after'])
    for (const c of report.cases.filter(
      (c) => c.id === id && c.arm === arm && c.complete,
    ))
      grouped.push(
        `## ${arm}, amostra ${c.sample}\n` +
          c.turns
            .map(
              (t, i) => `${i + 1}. Pessoa: ${t.user}\nAmadeus: ${t.assistant}`,
            )
            .join('\n\n'),
      );
}
await writeFile(
  new URL('transcricoes-completas.md', directory),
  grouped.join('\n\n') + '\n',
);
console.log(JSON.stringify(summary, null, 2));
