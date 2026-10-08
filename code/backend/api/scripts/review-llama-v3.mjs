import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';

const path = process.argv[2];
if (!path || !path.endsWith('.json'))
  throw new Error('Informe o relatório textual concluído.');
const url = pathToFileURL(path);
const report = JSON.parse(await readFile(url, 'utf8'));
if (!report.completedAt || report.calls.some((c) => c.status === 'pending'))
  throw new Error('Aguarde a conclusão da rodada.');
const jobs = report.plan?.frozen?.jobs;
if (!Array.isArray(jobs)) throw new Error('Relatório sem cenários planejados.');
const expectedTurns = new Map(
  jobs.map((job) => [job.scenario.id, job.scenario.turns.length]),
);
const candidates = report.cases.filter(
  (c) =>
    c.model === 'llama' &&
    c.phase !== 'latency' &&
    c.turns.length === expectedTurns.get(c.id) &&
    c.turns.every((t) => t.assistant && !t.errors.length),
);
const scenarioIds = [...new Set(candidates.map((c) => c.id))].sort();
const items = [];
const privateKeys = [];
for (const scenario of scenarioIds) {
  for (let index = 0; index < expectedTurns.get(scenario); index++) {
    const options = candidates
      .filter((c) => c.id === scenario)
      .toSorted((a, b) =>
        fingerprint([scenario, index, a.variant, a.sample]).localeCompare(
          fingerprint([scenario, index, b.variant, b.sample]),
        ),
      );
    const chosen = options[0];
    const turn = chosen.turns[index];
    const id = fingerprint([
      url.pathname,
      scenario,
      index,
      chosen.variant,
      chosen.sample,
    ]).slice(0, 12);
    privateKeys.push({
      id,
      scenario,
      phase: chosen.phase,
      variant: chosen.variant,
      sample: chosen.sample,
      turn: index + 1,
    });
    items.push({
      id,
      expectation:
        chosen.expectation ??
        report.plan.frozen.prepared?.evaluationOnly.find(
          (entry) => entry.id === scenario,
        )?.expectation,
      user: turn.user,
      initiativeKind: turn.initiativeKind,
      history: turn.history,
      facts: turn.facts.map((f) => f.text),
      assistant: turn.assistant,
      humanChecks: null,
    });
  }
}
// Presentation order is independent of outputs and labels.
items.sort((a, b) => a.id.localeCompare(b.id));
const review = {
  sourceHash: fingerprint(report),
  selectionImplementationHash: fingerprint(
    await readFile(new URL(import.meta.url), 'utf8'),
  ),
  targetModel: 'llama',
  evaluatorKind: 'unreviewed',
  personallyReviewed: false,
  blind: true,
  blindDimensions: ['variant', 'sample', 'automaticScores'],
  selection:
    'One current reply per scenario and turn from complete conversations, selected by hash without quality labels. Turns in a scenario remain correlated.',
  items,
};
const prefix = url.href.replace('.json', '-llama-review');
await writeFile(new URL(prefix + '.json'), JSON.stringify(review, null, 2));
await writeFile(
  new URL(prefix + '-private.json'),
  JSON.stringify(privateKeys, null, 2),
);
await writeFile(
  new URL(prefix + '.md'),
  '# Revisão pessoal do Llama — variantes ocultas\n\nTodas as respostas são do Llama. Ajuste, amostra e notas automáticas estão ocultos. Avalie somente a resposta atual, usando histórico e fatos como contexto. Use aprova/reprova/incerto/não aplicável e um motivo para interlocução, proporcionalidade, sustentação factual, continuidade, persona, perguntas, recomendações e cânone. No roteiro emocional, julgue também gatilho/alvo, intensidade proporcional e transição após reparo. Avalie a fala antes de consultar metadados. Educação ou concisão não bastam para aprovar persona. Estas fichas ainda não têm notas humanas; avaliações de outra IA devem manter essa origem. Não abra o mapa privado antes de revisar.\n\n' +
    items
      .map(
        (t, index) =>
          `## ${index + 1}. ${t.id}\n\nExpectativa: ${t.expectation}\n\nFatos fornecidos:\n\n${t.facts.length ? t.facts.map((fact) => '- ' + fact).join('\n') : '[Nenhum fato persistente fornecido]'}\n\nHistórico:\n\n${t.history.length ? t.history.map((entry) => `Pessoa: ${entry.userText || '[iniciativa]'}\n\nAmadeus: ${entry.sentText}`).join('\n\n') : '[Sem falas anteriores]'}\n\nPessoa agora: ${t.user || '[iniciativa]'}\n\nResposta avaliada: ${t.assistant}\n`,
      )
      .join('\n'),
);
console.log(
  JSON.stringify({
    items: items.length,
    scenarios: scenarioIds.length,
    path: new URL(prefix + '.md').pathname,
  }),
);
