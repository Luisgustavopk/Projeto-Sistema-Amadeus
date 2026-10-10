import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readPersonaResponse } from '../src/application/persona/response-stream.ts';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';

const path = process.argv[2];
if (!path || !path.endsWith('-quality-v3.json'))
  throw new Error('Informe o relatório quality-v3.json concluído.');
const url = pathToFileURL(path);
const report = JSON.parse(await readFile(url, 'utf8'));
if (!report.completedAt || report.calls.some((c) => c.status === 'pending'))
  throw new Error('Aguarde a conclusão da rodada.');
const records = [];
for (const item of report.cases.filter((c) =>
  c.turns.some((t) => t.facts.length),
)) {
  for (const [index, turn] of item.turns.entries()) {
    const attempts = [];
    for (const input of turn.inputs) {
      let declaration = null;
      let expressionValid = false;
      let error = null;
      try {
        for await (const _chunk of readPersonaResponse(
          (async function* () {
            yield input.raw;
          })(),
          (_expression, valid) => {
            expressionValid = valid;
          },
          (value) => {
            declaration = value;
          },
        )) {
          // Parsing is local; no model, verifier or voice call is performed.
          void _chunk;
        }
      } catch (failure) {
        error = { name: failure.name, code: failure.code ?? null };
      }
      attempts.push({
        requestHash: input.hash,
        declaration,
        expressionValid,
        error,
        validIndices:
          declaration?.facts.every((id) => id < turn.facts.length) ?? null,
        factsInMessages: turn.facts.every((fact) =>
          input.messages.some((m) =>
            m.content.includes(JSON.stringify(fact.text)),
          ),
        ),
      });
    }
    records.push({
      model: item.model,
      phase: item.phase,
      variant: item.variant,
      scenario: item.id,
      sample: item.sample,
      turn: index + 1,
      successful: Boolean(turn.assistant && !turn.errors.length),
      attempts,
    });
  }
}
const groups = [
  ...new Set(records.map((r) => [r.phase, r.model, r.variant].join(':'))),
];
const cells = groups.map((group) => {
  const turns = records.filter(
    (r) => [r.phase, r.model, r.variant].join(':') === group,
  );
  const good = turns.filter((r) => r.successful);
  const last = good.map((r) => r.attempts.at(-1));
  return {
    group,
    attemptedTurns: turns.length,
    successfulTurns: good.length,
    factsPresent: last.filter((a) => a?.factsInMessages).length,
    declaredUse: last.filter(
      (a) => a?.declaration?.facts.length && a.validIndices,
    ).length,
    declaredNone: last.filter((a) => a?.declaration?.use === 'none').length,
    absentDeclaration: last.filter((a) => !a?.declaration).length,
    invalidIndices: last.filter((a) => a?.validIndices === false).length,
    invalidAttempts: turns.flatMap((r) => r.attempts).filter((a) => a.error)
      .length,
  };
});
const audit = {
  source: url.pathname,
  sourceHash: fingerprint(report),
  implementationHash: fingerprint(
    await readFile(new URL(import.meta.url), 'utf8'),
  ),
  scope:
    'Offline metadata audit. A valid declaration does not prove factual grounding; no independent verifier ran.',
  cells,
  records,
};
await writeFile(
  new URL(url.href.replace('.json', '-memory-audit.json')),
  JSON.stringify(audit, null, 2),
);
console.log(JSON.stringify({ cells }));
