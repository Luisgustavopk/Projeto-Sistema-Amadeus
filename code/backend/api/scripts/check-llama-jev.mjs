import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { createClient } from '@libsql/client';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import {
  personaAnalysisProfile,
  PersonaAnalysisStateSchema,
} from '../src/application/persona/analysis.ts';
import { PersonaAnalysisConfigurationSchema } from '../src/domain/persona/tone.ts';
import { ProvidersSchema } from '../src/domain/providers/model.ts';
import { buildLlamaRefinement } from '../src/application/providers/llama-refinement.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createJevClient } from '../src/adapters/providers/jev.ts';
import { ProviderSchema } from '../src/domain/providers/model.ts';
import { LLAMA_REFINEMENT_MODEL } from '../src/domain/providers/openrouter.ts';
import { buildPersonaPrompt } from '../src/application/persona/prompt.ts';
import {
  TONE_CRITERIA,
  TONE_INSTRUCTIONS,
  toneDirection,
} from '../src/application/persona/tone-rubric.ts';
import {
  readPersonaResponse,
  validateSpokenSegment,
} from '../src/application/persona/response-stream.ts';

async function main() {
  if (process.argv.length > 2)
    throw new Error(
      'Este ensaio usa somente os três cenários sintéticos fixos.',
    );
  const database = createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
  });
  try {
    const owner = process.env.OWNER_ID ?? 'primary';
    const usage = new SqliteProviderUsageRepository(database);
    const row = (
      await database.execute({
        sql: 'SELECT config_json FROM foundation_provider_config WHERE owner_id=?',
        args: [owner],
      })
    ).rows[0];
    if (!row) throw new Error('Configure os provedores antes do ensaio.');
    const providers = ProvidersSchema.parse(
      JSON.parse(String(row.config_json)),
    );
    const profile =
      providers.llm.model === LLAMA_REFINEMENT_MODEL &&
      providers.llm.openRouterPaid
        ? providers.llm
        : buildLlamaRefinement(providers).llm;
    const provider = createProviderFactory(process.env)(
      'llm',
      ProviderSchema.parse(profile),
    );
    const analysisRow = (
      await database.execute({
        sql: 'SELECT value FROM settings WHERE key=?',
        args: [`persona-analysis:${owner}`],
      })
    ).rows[0];
    const analysisConfig = analysisRow
      ? PersonaAnalysisStateSchema.parse(JSON.parse(String(analysisRow.value)))
          .configuration
      : PersonaAnalysisConfigurationSchema.parse({});
    const analysisProfile = personaAnalysisProfile(analysisConfig);
    async function budgeted(config, estimatedTokens, call) {
      const reservation = await usage.reserve(
        owner,
        'llm',
        config,
        estimatedTokens,
      );
      let outcome = null;
      try {
        const result = await call();
        outcome = {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
        return result;
      } finally {
        await usage.settle(reservation, outcome);
      }
    }
    const jev = createJevClient(process.env);
    const cases = [
      {
        id: 'ficcao',
        text: 'De forma fictícia, me fala o que poderia ter acontecido no seu dia.',
      },
      {
        id: 'reparo',
        text: 'Você repetiu a mesma resposta três vezes. Isso está me irritando. Pode falar de um jeito mais direto?',
      },
      {
        id: 'entusiasmo',
        text: 'Terminei uma campanha de RPG com meus amigos e o final foi incrível! Nosso plano completamente absurdo funcionou.',
      },
    ];
    const records = [];
    for (const scenario of cases) {
      const started = performance.now();
      let decision = null;
      const decisionInput = {
        state: { currentUserText: scenario.text, recentConversation: '' },
        instructions: TONE_INSTRUCTIONS,
        criteria: TONE_CRITERIA,
      };
      try {
        decision = await budgeted(
          analysisProfile,
          Buffer.byteLength(JSON.stringify(decisionInput), 'utf8') + 256,
          () =>
            jev.decide(
              decisionInput,
              AbortSignal.timeout(analysisConfig.timeoutMs),
            ),
        );
      } catch (error) {
        decision = { error: error.code ?? error.name };
      }
      const analysisMs = Math.round(performance.now() - started);
      for (const steering of [false, true]) {
        const start = performance.now();
        const direction =
          steering && decision.confidence >= analysisConfig.minimumConfidence
            ? toneDirection(decision.tone)
            : '';
        try {
          const input = {
            content: 'Nova fala:\n' + JSON.stringify({ user: scenario.text }),
            systemPrompt: buildPersonaPrompt() + direction,
            dataClass: 'synthetic',
            maxTokens: 256,
          };
          const output = await budgeted(
            profile,
            Buffer.byteLength(input.content + input.systemPrompt, 'utf8') + 256,
            () => provider.execute(input, AbortSignal.timeout(60000)),
          );
          let expressionValid = false;
          let spoken = '';
          for await (const chunk of readPersonaResponse(
            (async function* () {
              yield output.content;
            })(),
            (_value, valid) => {
              expressionValid = valid;
            },
          ))
            spoken += chunk;
          spoken = validateSpokenSegment(spoken);
          records.push({
            scenario: scenario.id,
            userText: scenario.text,
            steering,
            steeringApplied: Boolean(direction),
            decision,
            analysisMs,
            elapsedMs: Math.round(performance.now() - start),
            expressionValid,
            spoken,
            inputTokens: output.inputTokens,
            outputTokens: output.outputTokens,
            estimatedMaximumCostUsd:
              ((output.inputTokens ?? 0) * 0.15 +
                (output.outputTokens ?? 0) * 0.4) /
              1000000,
          });
        } catch (error) {
          records.push({
            scenario: scenario.id,
            steering,
            decision,
            analysisMs,
            error: error.code ?? error.name,
          });
        }
        console.log(JSON.stringify(records.at(-1)));
      }
    }
    const directory = new URL('../data/refinement/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const filename =
      'llama-jev-' + new Date().toISOString().replaceAll(':', '-') + '.json';
    await writeFile(
      new URL(filename, directory),
      JSON.stringify(
        {
          dataClass: 'synthetic',
          model: LLAMA_REFINEMENT_MODEL,
          records,
          limitations:
            'Ensaio curto de integração; não certifica ganho de personalidade ou latência p95.',
        },
        null,
        2,
      ) + '\n',
    );
    console.log('Relatório local: data/refinement/' + filename);
    if (
      records.some(
        (record) =>
          record.error ||
          !record.spoken ||
          !record.expressionValid ||
          record.decision?.error,
      )
    )
      process.exitCode = 1;
  } finally {
    database.close();
  }
}
main().catch((error) => {
  console.error(error.code ?? error.name);
  process.exitCode = 1;
});
