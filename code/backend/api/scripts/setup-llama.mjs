import { createClient } from '@libsql/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { ProvidersSchema } from '../src/domain/providers/model.ts';
import { buildLlamaRefinement } from '../src/application/providers/llama-refinement.ts';
import { PersonaAnalysisStateSchema } from '../src/application/persona/analysis.ts';
import { PersonaAnalysisConfigurationSchema } from '../src/domain/persona/tone.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { configuredProviderAttempts } from '../src/application/providers/routing.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--disable-jev'].includes(arg)))
    throw new Error('Opções: --apply, --disable-jev.');
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error('Configure OPENROUTER_API_KEY no .env.');
  const owner = process.env.OWNER_ID ?? 'primary';
  const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
  });
  try {
    const row = (
      await client.execute({
        sql: 'SELECT config_json FROM foundation_provider_config WHERE owner_id=?',
        args: [owner],
      })
    ).rows[0];
    if (!row)
      throw new Error(
        'Configure os provedores da conversa antes deste refinamento.',
      );
    const previous = String(row.config_json);
    const current = ProvidersSchema.parse(JSON.parse(previous));
    const next = buildLlamaRefinement(current);
    const factory = createProviderFactory(process.env);
    for (const attempt of configuredProviderAttempts('llm', next.llm))
      factory('llm', attempt);
    const analysisKey = `persona-analysis:${owner}`;
    const analysisRow = (
      await client.execute({
        sql: 'SELECT value FROM settings WHERE key=?',
        args: [analysisKey],
      })
    ).rows[0];
    const previousAnalysis = analysisRow ? String(analysisRow.value) : null;
    const revision = previousAnalysis
      ? PersonaAnalysisStateSchema.parse(JSON.parse(previousAnalysis)).revision
      : 0;
    const analysis = PersonaAnalysisStateSchema.parse({
      revision: revision + 1,
      configuration: PersonaAnalysisConfigurationSchema.parse({
        enabled: !args.includes('--disable-jev'),
        dataPolicy: 'personal-approved',
        policyReviewedAt: new Date().toISOString(),
        policyReference: 'https://openrouter.ai/privacy',
      }),
    });
    console.log(
      JSON.stringify(
        {
          apply: args.includes('--apply'),
          primary: next.llm.model,
          priceCeilingUsdPerMillion: next.llm.openRouterPaid,
          limits: next.llm.limits,
          reserves: next.llm.fallbackProviders.map((p) => ({
            adapter: p.adapter,
            model: p.model,
            dataPolicy: p.dataPolicy,
            limits: p.limits,
          })),
          analysis: analysis.configuration,
        },
        null,
        2,
      ),
    );
    if (!args.includes('--apply')) return;
    // Offline configuration avoids changing providers during an active call.
    let apiRunning = false;
    const port = Number(process.env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('PORT inválida.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {
        signal: AbortSignal.timeout(1000),
      });
      apiRunning = true;
      await response.body?.cancel();
    } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED')
        throw new Error('Não foi possível verificar se a API está encerrada.', {
          cause: error,
        });
    }
    if (apiRunning)
      throw new Error(
        'Encerre a API antes de aplicar esta configuração offline.',
      );
    const directory = new URL('../data/refinement/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const backup = new URL('before-' + Date.now() + '.json', directory);
    await writeFile(
      backup,
      JSON.stringify(
        {
          owner,
          providers: current,
          personaAnalysis: previousAnalysis
            ? JSON.parse(previousAnalysis)
            : null,
        },
        null,
        2,
      ) + '\n',
    );
    const tx = await client.transaction('write');
    try {
      const updated = await tx.execute({
        sql: 'UPDATE foundation_provider_config SET config_json=? WHERE owner_id=? AND config_json=?',
        args: [JSON.stringify(next), owner, previous],
      });
      if (updated.rowsAffected !== 1)
        throw new Error('Configuração de provedores alterada simultaneamente.');
      const analysisUpdated =
        previousAnalysis === null
          ? await tx.execute({
              sql: 'INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',
              args: [analysisKey, JSON.stringify(analysis)],
            })
          : await tx.execute({
              sql: 'UPDATE settings SET value=? WHERE key=? AND value=?',
              args: [JSON.stringify(analysis), analysisKey, previousAnalysis],
            });
      if (analysisUpdated.rowsAffected !== 1)
        throw new Error('Configuração Jev alterada simultaneamente.');
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    console.log(
      'Llama principal e análise Jev salvos. Backup local: ' +
        backup.pathname.split('/').at(-1) +
        '. Inicie a API com npm run dev.',
    );
  } finally {
    client.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
