import { createClient } from '@libsql/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createJevClient } from '../src/adapters/providers/jev.ts';
import { createPersonaAnalysis } from '../src/application/persona/analysis.ts';

// No personal data, extraction or conversation writes; existing budgets apply.
const cases = [
  { text: 'Achas de petróleo', expected: true },
  { text: 'O negócio daquele...', expected: true },
  { text: 'What do you think about oil as an energy source?', expected: false },
  { text: 'Você tem um jogo interessante para me indicar?', expected: false },
  { text: 'Eae Christine, tudo bem?', expected: false },
  {
    text: 'Esse tem multiplayer?',
    history:
      '[{"user":"Me indica um jogo","assistantConfirmed":"Divinity: Original Sin 2."}]',
    expected: false,
  },
];
const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
});
try {
  await client.execute('PRAGMA busy_timeout = 3000');
  const jev = createJevClient(process.env);
  let latest = null;
  const service = createPersonaAnalysis({
    repository: createRevisionRepository(client),
    usage: new SqliteProviderUsageRepository(client),
    ownerId: process.env.OWNER_ID ?? 'primary',
    client: {
      ...jev,
      async decide(input, signal) {
        try {
          const result = await jev.decide(input, signal);
          latest = result.clarity;
          return result;
        } catch (error) {
          console.log(
            JSON.stringify({
              analysisError: error.code ?? error.name,
              reason:
                error.code === 'PROVIDER_INVALID' ? error.message : undefined,
            }),
          );
          throw error;
        }
      },
    },
  });
  const records = [];
  for (const scenario of cases) {
    latest = null;
    let result = null;
    await service.analyze(
      {
        text: scenario.text,
        recentConversation: scenario.history ?? '[]',
        dataClass: 'synthetic',
      },
      AbortSignal.timeout(3000),
      (value) => {
        result = value;
      },
    );
    const record = {
      ...scenario,
      decision: latest,
      result,
      passed: result === scenario.expected,
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
  const directory = new URL('../data/refinement/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const filename =
    'input-clarity-' + new Date().toISOString().replaceAll(':', '-') + '.json';
  await writeFile(
    new URL(filename, directory),
    JSON.stringify(
      {
        records,
        limitations:
          'Seis casos fictícios: disponibilidade e classificação probabilísticas, não garantia geral. Não inclui STT ou síntese.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Relatório local: data/refinement/' + filename);
  if (records.some((record) => !record.passed)) process.exitCode = 1;
} finally {
  client.close();
}
