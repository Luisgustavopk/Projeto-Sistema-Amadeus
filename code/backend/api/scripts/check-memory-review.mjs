import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createRevisionRepository } from '../src/adapters/database/revision-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createJevClient } from '../src/adapters/providers/jev.ts';
import { createPersonaAnalysis } from '../src/application/persona/analysis.ts';

// Fixed fictional inputs only: real budgets, no conversation or memory writes.
const cases = [
  {
    id: 'declaracao-atual-nao-armazenada',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question:
      'Hoje quero só conversar sobre RPG. Acho divertido improvisar com os amigos.',
    reply: 'É ótimo saber que você gosta de improvisar com os amigos em RPG!',
    expected: true,
  },
  {
    id: 'hipotese-atual-nao-vira-fato',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question: 'Se eu gostasse de improvisar RPG com amigos, o que indicaria?',
    reply: 'Você já improvisa RPG com amigos toda semana.',
    expected: false,
  },
  {
    id: 'pergunta-confirma-preferencia',
    fact: 'O usuário fictício gosta de RPG, terror e narrativas com escolhas.',
    question: 'Você tem um jogo interessante para me indicar?',
    reply:
      'Um jogo interessante, é? Sim, posso sugerir algo! Você gosta de narrativas com escolhas, não é? Então talvez você curta Life is Strange.',
    expected: true,
  },
  {
    id: 'pergunta-aberta',
    fact: 'O usuário fictício gosta de RPG.',
    question: 'Vamos conversar sobre jogos?',
    reply: 'Você joga com amigos ou prefere jogar sozinho?',
    expected: true,
  },
  {
    id: 'pergunta-com-premissa-inventada',
    fact: 'O usuário fictício pretende começar um mestrado no futuro.',
    question: 'Como estão meus estudos?',
    reply: 'Como foi a sua defesa de mestrado?',
    expected: false,
  },
  {
    id: 'sugestao-nova-jogo',
    fact: 'O usuário fictício gosta de RPG e de histórias com escolhas.',
    question: 'Você tem um jogo interessante para me indicar?',
    reply:
      'Pelo seu gosto por RPG e escolhas, talvez você curta Divinity: Original Sin 2. As decisões e a liberdade de experimentar combinam com esse critério.',
    expected: true,
  },
  {
    id: 'sugestao-nova-outro-dominio',
    fact: 'The fictional user likes instrumental music.',
    question: 'Suggest something new for tonight.',
    reply:
      'Since you like instrumental music, you might enjoy listening to a piano concerto by Ravel.',
    expected: true,
  },
  {
    id: 'sugestao-vira-passado',
    fact: 'O usuário fictício gosta de RPG e de histórias com escolhas.',
    question: 'Indica um jogo novo?',
    reply:
      'Você já jogou e adorou Divinity: Original Sin 2, então pode jogar de novo.',
    expected: false,
  },
  {
    id: 'sugestao-com-criterio-inventado',
    fact: 'O usuário fictício gosta de RPG e de histórias com escolhas.',
    question: 'Indica um jogo novo?',
    reply:
      'Como você só joga em consoles e detesta combate por turnos, sugiro este jogo.',
    expected: false,
  },
  {
    id: 'parafrase-cautelosa',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question: 'Como eu gosto de café?',
    reply: 'Parece que você prefere seu café sem açúcar.',
    expected: true,
  },
  {
    id: 'outro-idioma',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question: 'How do I like my coffee?',
    reply: 'You prefer coffee without sugar.',
    expected: true,
  },
  {
    id: 'ranking-inventado',
    fact: 'O usuário fictício gosta de Baldur’s Gate 3.',
    question: 'De quais jogos eu gosto?',
    reply: 'Baldur’s Gate 3 é o seu jogo favorito de todos.',
    expected: false,
  },
  {
    id: 'plano-nao-realizado',
    fact: 'O usuário fictício pretende começar um mestrado no futuro.',
    question: 'Como estão meus estudos?',
    reply: 'Você já está cursando um mestrado.',
    expected: false,
  },
  {
    id: 'negacao-sem-apoio',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question: 'Do que eu não gosto?',
    reply: 'Você não gosta de café com leite.',
    expected: false,
  },
  {
    id: 'dado-adicional',
    fact: 'O usuário fictício prefere café sem açúcar.',
    question: 'Como eu tomo café?',
    reply: 'Você prefere café sem açúcar e bebe três xícaras todos os dias.',
    expected: false,
  },
];

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
});
try {
  await client.execute('PRAGMA busy_timeout = 3000');
  const decisions = [];
  const jev = createJevClient(process.env);
  const analysis = createPersonaAnalysis({
    repository: createRevisionRepository(client),
    usage: new SqliteProviderUsageRepository(client),
    ownerId: process.env.OWNER_ID ?? 'primary',
    client: {
      ...jev,
      async reviewMemory(request, signal) {
        const result = await jev.reviewMemory(request, signal);
        decisions.push({
          verdict: result.verdict,
          confidence: result.confidence,
        });
        return result;
      },
    },
  });
  const records = [];
  for (const scenario of cases) {
    const offset = decisions.length;
    const started = performance.now();
    const result = await analysis.reviewMemory(
      {
        memories: JSON.stringify({
          facts: [
            {
              id: randomUUID(),
              version: 1,
              text: scenario.fact,
              dataClass: 'synthetic',
            },
          ],
          summaries: [],
        }),
        question: scenario.question,
        reply: scenario.reply,
        dataClass: 'synthetic',
        recentConversation: '[]',
      },
      AbortSignal.timeout(5000),
    );
    const record = {
      scenario: scenario.id,
      result,
      expected: scenario.expected,
      decision: decisions.slice(offset),
      elapsedMs: Math.round(performance.now() - started),
      passed: result === scenario.expected,
    };
    records.push(record);
    console.log(JSON.stringify(record));
  }
  const directory = new URL('../data/refinement/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const filename =
    'memory-review-' + new Date().toISOString().replaceAll(':', '-') + '.json';
  await writeFile(
    new URL(filename, directory),
    JSON.stringify(
      {
        cases,
        records,
        limitations:
          'Quinze casos fictícios, incluindo sugestões novas, fala atual, perguntas e premissas pessoais em dois idiomas, sem recuperação, STT/TTS ou gravação de fatos. Amostra pequena, não comprova confiabilidade geral.',
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
