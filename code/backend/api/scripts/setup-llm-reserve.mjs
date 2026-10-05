import { mkdir, writeFile } from 'node:fs/promises';
import { ProvidersSchema } from '../src/domain/providers/model.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--personal', '--disable'].includes(arg)))
    throw new Error('Opções: --apply, --personal, --disable.');
  if (!process.env.API_ACCESS_TOKEN)
    throw new Error(
      'Configure API_ACCESS_TOKEN no .env e execute na pasta da API.',
    );
  const headers = {
    authorization: 'Bearer ' + process.env.API_ACCESS_TOKEN,
    'content-type': 'application/json',
  };
  const endpoint = 'http://127.0.0.1:3001/v1/providers';
  const response = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error('Falha ao ler configuração: HTTP ' + response.status);
  const current = ProvidersSchema.parse(await response.json());
  if (!['groq', 'gemini', 'cloudflare-ai'].includes(current.llm.adapter))
    throw new Error(
      'Este assistente de configuração exige um principal Groq, Gemini ou Cloudflare já configurado.',
    );
  const next = globalThis.structuredClone(current);
  const disable = args.includes('--disable');
  const personal = args.includes('--personal');
  const policy = (reference) =>
    personal
      ? {
          dataPolicy: 'personal-approved',
          policyReviewedAt: new Date().toISOString(),
          policyReference: reference,
        }
      : { dataPolicy: 'synthetic-only' };
  const reserves = [];
  if (!disable) {
    if (process.env.MISTRAL_API_KEY)
      reserves.push({
        adapter: 'mistral',
        model: 'mistral-small-latest',
        apiKeyEnv: 'MISTRAL_API_KEY',
        ...policy('https://mistral.ai/terms'),
      });
    if (process.env.OPENROUTER_API_KEY)
      for (const model of [
        'qwen/qwen3.8-27b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
      ])
        reserves.push({
          adapter: 'openrouter',
          model,
          apiKeyEnv: 'OPENROUTER_API_KEY',
          ...policy('https://openrouter.ai/privacy'),
          limits: {
            requestsPerDay: 50,
            tokensPerDay: next.llm.limits.tokensPerDay,
            source: 'operator',
          },
        });
    if (!reserves.length)
      throw new Error(
        'Adicione MISTRAL_API_KEY ou OPENROUTER_API_KEY ao .env.',
      );
  }
  const existing = (next.llm.fallbackProviders ?? []).filter(
    (p) => !['mistral', 'openrouter'].includes(p.adapter),
  );
  if (next.llm.fallbackModel) {
    existing.push({
      adapter: 'gemini',
      model: next.llm.fallbackModel,
      apiKeyEnv: next.llm.apiKeyEnv,
      dataPolicy: 'synthetic-only',
      geminiTier: next.llm.geminiTier,
    });
    delete next.llm.fallbackModel;
  }
  next.llm.fallbackProviders = [...reserves, ...existing];
  if (next.llm.localProvider && !disable) next.llm.localRouting = 'cloud-first';
  ProvidersSchema.parse(next);
  console.log(
    JSON.stringify(
      {
        apply: args.includes('--apply'),
        personalDataApproved: personal,
        reserves: next.llm.fallbackProviders.map((p) => ({
          adapter: p.adapter,
          model: p.model,
          dataPolicy: p.dataPolicy,
        })),
        localFallback: Boolean(next.llm.localProvider),
      },
      null,
      2,
    ),
  );
  if (!args.includes('--apply')) {
    console.log(
      'Prévia. Use --apply para salvar. --personal registra sua revisão e aprovação das políticas dos novos provedores.',
    );
    return;
  }
  const directory = new URL('../data/llm-reserve/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('providers-before-' + Date.now() + '.json', directory),
    JSON.stringify(current, null, 2) + '\n',
  );
  const result = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify(next),
    signal: AbortSignal.timeout(15000),
  });
  if (!result.ok)
    throw new Error(
      'Configuração recusada: HTTP ' +
        result.status +
        '. Reinicie a API após editar o .env.',
    );
  console.log(
    'Reservas salvas. STT e TTS preservados. A disponibilidade real será verificada na primeira geração.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
