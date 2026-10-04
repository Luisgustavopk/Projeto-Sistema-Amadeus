import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { ProvidersSchema } from '../src/domain/providers/model.ts';
import { isCasualConversation } from '../src/domain/providers/conversation-routing.ts';

async function main() {
  const args = process.argv.slice(2);
  const tokenFile = new URL(
    '../../../../.cache/local-llm/access-token',
    import.meta.url,
  );
  if (args.includes('--prepare')) {
    const key = (await readFile(tokenFile, 'utf8')).trim();
    if (!/^[A-Za-z0-9+/=]{32,128}$/.test(key))
      throw new Error('Credencial local inválida.');
    const envFile = new URL('../.env', import.meta.url);
    const env = await readFile(envFile, 'utf8');
    const line = `LOCAL_LLM_API_KEY=${key}`;
    const updated = /^LOCAL_LLM_API_KEY=.*$/m.test(env)
      ? env.replace(/^LOCAL_LLM_API_KEY=.*$/m, line)
      : env.trimEnd() + '\n' + line + '\n';
    await writeFile(envFile, updated);
    console.log(
      'Credencial do runtime local configurada no .env. Reinicie a API antes de executar --apply.',
    );
    return;
  }
  const credential = process.env.API_ACCESS_TOKEN;
  if (!credential)
    throw new Error('Execute a partir da pasta api com o .env local.');
  const url = 'http://127.0.0.1:3001/v1/providers';
  const headers = {
    Authorization: `Bearer ${credential}`,
    'content-type': 'application/json',
  };
  const currentResponse = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!currentResponse.ok)
    throw new Error(
      `Leitura da configuração recusada: HTTP ${currentResponse.status}`,
    );
  const current = ProvidersSchema.parse(await currentResponse.json());
  const next = globalThis.structuredClone(current);
  if (args.includes('--disable')) delete next.llm.localProvider;
  else
    next.llm.localProvider = {
      adapter: 'openai-local',
      endpoint: 'http://127.0.0.1:8003/v1/chat/completions',
      model: 'amadeus-local',
      apiKeyEnv: 'LOCAL_LLM_API_KEY',
      dataPolicy: 'local-approved',
    };
  ProvidersSchema.parse(next);
  if (!args.includes('--apply')) {
    console.log(
      JSON.stringify(
        {
          currentCloudModel: current.llm.model,
          hybridEnabled: Boolean(current.llm.localProvider),
          proposedLocalModel: next.llm.localProvider?.model ?? null,
          examples: [
            'Oi, tudo bem?',
            'Me conta uma história legal.',
            'Analise este código.',
          ].map((text) => ({
            text,
            route: isCasualConversation(text) ? 'local' : 'cloud',
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      'Somente leitura. Para experimentar: --prepare, reiniciar a API e --apply. Para desativar: --disable --apply.',
    );
    return;
  }
  if (!args.includes('--disable')) {
    const key = (await readFile(tokenFile, 'utf8')).trim();
    const health = await fetch('http://127.0.0.1:8003/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok)
      throw new Error('Inicie o runtime local antes de ativar o experimento.');
  }
  const directory = new URL('../data/hybrid/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL(`providers-before-${Date.now()}.json`, directory),
    JSON.stringify(current, null, 2) + '\n',
  );
  const updated = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(next),
    signal: AbortSignal.timeout(10000),
  });
  if (!updated.ok) {
    const error = await updated.json();
    throw new Error(
      `${error.code ?? updated.status}: ${error.error ?? 'Configuração recusada.'}`,
    );
  }
  console.log(
    args.includes('--disable')
      ? 'Roteamento local desativado. Provedores anteriores preservados.'
      : 'Experimento híbrido ativado. Planos e políticas da nuvem preservados.',
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
