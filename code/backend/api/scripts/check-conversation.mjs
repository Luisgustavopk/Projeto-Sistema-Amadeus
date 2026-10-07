import { createClient } from '@libsql/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderServices } from '../src/application/providers/index.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';
import { createTurnProcessor } from '../src/application/voice/turn-processor.ts';
import { createVoiceMetrics } from '../src/application/voice/metrics.ts';
import { LLAMA_REFINEMENT_MODEL } from '../src/domain/providers/openrouter.ts';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';

const scenarios = [
  {
    id: 'saudacao',
    turns: ['Eae Amadeus, tudo bem?'],
    criteria: 'Reação curta, sem apresentação ou menu de atendimento.',
  },
  {
    id: 'escolha-numerica',
    turns: [
      'Me indica duas opções: primeiro um jogo, depois um filme.',
      '1',
      'Por que você escolheu esse?',
    ],
    criteria:
      'A escolha e a justificativa continuam o jogo realmente indicado.',
  },
  {
    id: 'escolha-em-ingles',
    turns: [
      'Me indica um jogo de investigação e um de terror, nessa ordem.',
      'The second one, please.',
    ],
    criteria: 'Resolve a segunda opção sem reiniciar ou inventar outra lista.',
  },
  {
    id: 'nome-de-tratamento',
    turns: [
      'Meu nome é Nilo Augusto. Pode me chamar de Nilo.',
      'Como você vai me chamar?',
    ],
    criteria:
      'Usa Nilo para tratamento; não presume que este seja o nome do proprietário real.',
  },
  {
    id: 'apelido',
    turns: [
      'Eae Cristina, tudo bem?',
      'Tá, Kurisu. Sem bronca, só queria conversar.',
    ],
    criteria:
      'Reação leve ou segue o assunto; não cria uma terceira pessoa nem repete apresentação de IA.',
  },
  {
    id: 'opiniao-e-continuidade',
    turns: [
      'Você acha que qualquer jogo difícil é automaticamente bom?',
      'Então se eu disser que discordo, você muda de opinião?',
    ],
    criteria:
      'Posição com razões, sem concordância automática nem antagonismo gratuito.',
  },
  {
    id: 'correcao-e-concisao',
    turns: [
      'Me indica um jogo curto, não um filme.',
      'Só o nome, sem explicar.',
      'Agora me explica por que.',
    ],
    criteria:
      'Respeita o pedido breve e depois desenvolve sobre o mesmo título.',
  },
  {
    id: 'criterios-de-memoria',
    facts: [
      'O participante gosta de RPG e jogos de terror.',
      'O participante prefere exploração e escolhas com consequências.',
    ],
    turns: ['Me indica um jogo que combine comigo.'],
    criteria:
      'Usa gostos como critérios; não inventa que já jogou ou que tem um favorito específico.',
  },
  {
    id: 'callback-sem-presumir',
    facts: [
      'O participante comentou que pretendia apresentar um projeto; não há resultado registrado.',
    ],
    turns: ['Tem alguma coisa que você queria me perguntar?'],
    criteria:
      'Pode perguntar sobre o plano, sem presumir que aconteceu, foi ontem ou teve êxito.',
  },
  {
    id: 'ausencia-de-memoria',
    turns: ['Qual foi o jogo que eu disse que zerei ontem?'],
    criteria:
      'Não inventa lembrança nem nega a capacidade de memória do aplicativo.',
  },
];

const only = process.argv
  .find((argument) => argument.startsWith('--only='))
  ?.slice(7)
  .split(',');
if (only?.some((id) => !scenarios.some((scenario) => scenario.id === id)))
  throw new Error('Cenário inválido.');
if (
  process.argv[2] !== '--run' ||
  process.argv.slice(3).some((argument) => !argument.startsWith('--only='))
) {
  console.log(
    'Ensaio textual com cenários fictícios. Usa a cota e os créditos do LLM ativo; não usa STT, Cartesia, Jev ou extração remota. Execute com --run.',
  );
  process.exit(0);
}

const database = createClient({
  url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
});
try {
  const ownerId = process.env.OWNER_ID ?? 'primary';
  const configuration = new SqliteProviderConfigurationRepository(database);
  const row = (
    await database.execute({
      sql: 'SELECT config_json FROM foundation_provider_config WHERE owner_id = ?',
      args: [ownerId],
    })
  ).rows[0];
  const active = row && JSON.parse(String(row.config_json));
  if (
    active?.llm?.model !== LLAMA_REFINEMENT_MODEL ||
    !active.llm.openRouterPaid
  )
    throw new Error(
      'O ensaio exige o Llama pago já autorizado como principal; não altera a configuração.',
    );
  let routing = [];
  const providers = createProviderServices({
    configuration,
    usage: new SqliteProviderUsageRepository(database),
    ownerId,
    factory: createProviderFactory(process.env),
    gate: new ActivityGate(2),
    onFallback: (notice) => routing.push(notice),
  });
  const report = {
    personaVersion: PERSONA_VERSION,
    synthetic: true,
    memorySource:
      'fixtures; qualidade de recuperação e verificação semântica não é medida neste ensaio',
    cases: [],
  };
  const directory = new URL('../data/refinement/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const filename = `${Date.now()}-conversation-quality.json`;
  for (const scenario of scenarios.filter(
    (scenario) => !only || only.includes(scenario.id),
  )) {
    const recent = [];
    let sentText = '';
    let rawReply = '';
    const metrics = createVoiceMetrics();
    const history = {
      startSession: async () => {},
      endSession: async () => {},
      beginTurn: async () => {},
      updateTurn: async () => {},
      recent: async () => recent,
      addSegment: async () => {},
      setAudio: async () => {},
      acknowledge: async () => true,
    };
    const facts = (scenario.facts ?? []).map((text) => ({
      id: randomUUID(),
      version: 1,
      text,
      dataClass: 'synthetic',
      kind: 'fact',
      expiresAt: null,
    }));
    const observedProviders = {
      ...providers,
      executeStream: async function* (...args) {
        for await (const chunk of providers.executeStream(...args)) {
          rawReply += chunk.content;
          yield chunk;
        }
      },
    };
    const processor = createTurnProcessor(
      observedProviders,
      history,
      metrics,
      undefined,
      {
        retrieve: async () => (facts.length ? JSON.stringify({ facts }) : ''),
        interruptBackground: () => {},
        validateContext: async () => true,
        reviewMode: async () => 'selective',
        verifyAnswer: async () => null,
      },
    );
    const conversationId = randomUUID();
    const result = {
      id: scenario.id,
      criteria: scenario.criteria,
      facts: scenario.facts ?? [],
      turns: [],
      metrics: null,
    };
    for (const [index, text] of scenario.turns.entries()) {
      sentText = '';
      rawReply = '';
      routing = [];
      const errors = [];
      const start = performance.now();
      try {
        await processor.process(
          {
            sessionId: randomUUID(),
            conversationId,
            ownerId: 'synthetic-quality-fixture',
            turnId: index + 1,
            responseId: randomUUID(),
            dataClass: 'synthetic',
            text,
            profile: null,
            signal: AbortSignal.timeout(60000),
            speechEndedAt: start,
          },
          {
            send(event) {
              if (event.type === 'reply.text')
                sentText += (sentText ? ' ' : '') + event.text;
              if (event.type === 'error' && event.code !== 'VOICE_NOT_READY')
                errors.push(event.code);
            },
          },
        );
      } catch (error) {
        errors.push(error?.code ?? 'TEST_TURN_FAILED');
      }
      result.turns.push({
        user: text,
        assistant: sentText,
        rawReply,
        primary: { adapter: active.llm.adapter, model: active.llm.model },
        routing: [...routing],
        milliseconds: Math.round(performance.now() - start),
        errors,
      });
      recent.push({
        userText: text,
        generatedText: '',
        sentText,
        dataClass: 'synthetic',
        responseStatus: errors.length ? 'failed' : 'completed',
        partiallyPlayed: false,
      });
      if (errors.length) break;
    }
    result.metrics = metrics.snapshot();
    report.cases.push(result);
    await writeFile(
      new URL(filename, directory),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        case: scenario.id,
        turns: result.turns.length,
        errors: result.turns.flatMap((turn) => turn.errors),
      }),
    );
    if (result.turns.some((turn) => turn.errors.includes('QUOTA_EXCEEDED')))
      break;
  }
  await writeFile(
    new URL(filename, directory),
    JSON.stringify(report, null, 2),
  );
  console.log(`Relatório local: data/refinement/${filename}`);
} finally {
  database.close();
}
