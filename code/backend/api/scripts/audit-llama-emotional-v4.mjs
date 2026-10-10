import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fingerprint } from '../src/evaluation/persona/diagnostics.ts';

const path = process.argv[2];
if (!path?.endsWith('.json')) throw new Error('Informe o relatório v4.');
const source = pathToFileURL(path);
const raw = await readFile(source, 'utf8');
const report = JSON.parse(raw);
if (
  !report.completedAt ||
  report.calls.some((call) => call.status === 'pending')
)
  throw new Error('Aguarde a interrupção ou conclusão da execução.');
const discarded = (report.interruptedCases ?? []).flatMap((item) => item.turns);
const current = report.cases.flatMap((item) => item.turns);
const allTurns = [...discarded, ...current];
const reportedUsd = report.calls.reduce(
  (sum, call) => sum + (call.usage?.cost ?? 0),
  0,
);
const unreported = report.calls.filter(
  (call) => !Number.isFinite(call.usage?.cost),
);
const uncertainReservedUsd = unreported.reduce(
  (sum, call) => sum + call.reservedUsd,
  0,
);
const priorCommittedUsd = report.plan.frozen.parentBudget.priorCommittedUsd;
const reconciledCommittedUsd =
  priorCommittedUsd + reportedUsd + uncertainReservedUsd;
const changes = [];
for (const [path, expected] of Object.entries(
  report.plan.frozen.implementation,
)) {
  const actual = fingerprint(
    await readFile(new URL('../' + path, import.meta.url), 'utf8'),
  );
  if (actual !== expected)
    changes.push({
      path,
      expected,
      actual,
      recordedExecutorEpoch:
        path === 'scripts/eval-llama-emotional-v4.mjs' &&
        report.executionEpochs?.some((epoch) => epoch.executorHash === actual),
    });
}
const resources = [];
for (const [path, expected] of Object.entries(report.plan.frozen.resources)) {
  const actual = fingerprint(await readFile(new URL('file://' + path), 'utf8'));
  if (actual !== expected) resources.push({ path, expected, actual });
}
const anchors = report.cases.flatMap((item) =>
  item.turns
    .filter((turn) => turn.initiativeKind === 'initiative')
    .map((turn) => ({
      scenario: item.id,
      sample: item.sample,
      variant: item.variant,
      provided: turn.inputs.every((input) =>
        input.messages.some((message) =>
          message.content.includes('<presence_anchor>'),
        ),
      ),
      sourceWindow:
        turn.inputs[0]?.messages.flatMap(
          (message) =>
            message.content.match(
              /<presence_anchor>[\s\S]*?<\/presence_anchor>/gu,
            ) ?? [],
        ) ?? [],
    })),
);
const callIds = allTurns.flatMap((turn) => turn.callIds ?? []);
const audit = {
  sourceHash: fingerprint(raw),
  scope:
    'Auditoria estrutural e financeira; não aprova semântica, persona ou voz.',
  plannedTurns: report.plan.plannedTurns,
  currentAttemptedTurns: current.length,
  interruptedAttemptedTurns: discarded.length,
  totalCalls: report.calls.length,
  allCallsLinked: report.calls.every(
    (call) => callIds.filter((id) => id === call.id).length === 1,
  ),
  fixedRoute: report.calls.every(
    (call) =>
      call.request.model === 'meta-llama/llama-3.3-70b-instruct' &&
      call.request.provider.only?.join(',') === 'deepinfra/turbo' &&
      call.request.provider.allow_fallbacks === false,
  ),
  frozenSampling: report.calls.every(
    (call) =>
      call.request.temperature === 0.6 && call.request.max_tokens <= 512,
  ),
  originalManifestValid:
    fingerprint(report.plan.frozen) === report.plan.fingerprint,
  changedImplementation: changes,
  changedResources: resources,
  anchors,
  budget: {
    roundMaxUsd: report.budget.roundMaxUsd,
    priorCommittedUsd,
    newReportedUsd: reportedUsd,
    unreportedCalls: unreported.length,
    uncertainReservedUsd,
    newCommittedUsd: reportedUsd + uncertainReservedUsd,
    reconciledCommittedUsd,
    ledgerCommittedUsd: report.budget.roundCommittedUsd,
    reconciled:
      Math.abs(reconciledCommittedUsd - report.budget.roundCommittedUsd) <
      1e-10,
    withinCeiling: report.budget.roundCommittedUsd <= report.budget.roundMaxUsd,
    remainingUsd: report.budget.roundMaxUsd - report.budget.roundCommittedUsd,
  },
  remoteFailures: report.calls
    .filter((call) => call.httpStatus !== 200)
    .map((call) => ({
      httpStatus: call.httpStatus,
      retryAfterMs: call.retryAfterMs,
      ...call.remoteFailure,
    })),
};
await writeFile(
  new URL(source.href.replace(/\.json$/u, '-execution-audit.json')),
  JSON.stringify(audit, null, 2),
);
console.log(
  JSON.stringify({
    ...audit,
    anchors: anchors.map(({ sourceWindow, ...anchor }) => ({
      ...anchor,
      sourceWindows: sourceWindow.length,
    })),
  }),
);
