import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.ts';
import { memoryReview, renderMemoryReview } from './memory-review.mjs';

async function main() {
  if (process.argv.includes('--help') || process.argv[2] === 'help') {
    console.log(
      'Aprovação automática: npm run memory -- auto-approve --on\nVoltar à revisão manual: npm run memory -- auto-approve --off\nRevisar: npm run memory -- review\nJSON: npm run memory -- review --json\nConsolidar equivalências claras: npm run memory -- consolidate\nOs comandos de aprovação mostram IDs reais em review. Confirmar não autoriza envio remoto sem --permission=eligible.',
    );
    return;
  }
  const config = loadConfig();
  const argumentsList = process.argv.slice(2);
  const command = argumentsList[0] ?? 'status';
  const value = (flag) =>
    argumentsList
      .find((entry) => entry.startsWith(flag + '='))
      ?.slice(flag.length + 1);
  const base = value('--api') ?? 'http://127.0.0.1:' + config.PORT;

  if (!['http:', 'https:'].includes(new URL(base).protocol)) {
    throw new Error('Endereço HTTP da API inválido.');
  }

  const headers = {
    authorization: 'Bearer ' + config.API_ACCESS_TOKEN,
  };
  let path;
  let method = 'GET';
  let body;
  const id = value('--id');

  if (id && !/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error(
      'ID inválido: ID_DO_FATO é um exemplo, não um identificador real. Execute npm run memory -- review e copie o comando com o ID do fato desejado.',
    );
  }

  switch (command) {
    case 'status':
      path = '/v1/memory/status';
      break;
    case 'extractor':
      path = '/v1/memory/extractor';
      break;
    case 'configure-extractor':
      path = '/v1/memory/extractor';
      method = 'PUT';
      break;
    case 'facts':
    case 'review':
      path = '/v1/facts';
      break;
    case 'consolidate':
      path = '/v1/memory/consolidate';
      method = 'POST';
      break;
    case 'summaries':
      path = '/v1/memory/summaries';
      break;
    case 'graph':
      path = '/v1/memory/graph';
      break;
    case 'conversations':
      path = '/v1/conversations';
      break;
    case 'export':
      path = '/v1/memory/export';
      break;
    case 'configure': {
      if (!argumentsList.includes('--acknowledge-local-storage')) {
        throw new Error(
          'Informe --acknowledge-local-storage para reconhecer armazenamento e retenção descritos em docs/architecture/Memoria_Fase_3.md.',
        );
      }

      const current = await fetch(base + '/v1/memory/policy', { headers });

      if (!current.ok) {
        throw new Error('Não foi possível consultar a política.');
      }

      const policy = await current.json();
      path = '/v1/memory/policy';
      method = 'PUT';
      body = {
        expectedRevision: policy.revision,
        enabled: !argumentsList.includes('--disabled'),
        personalEnabled: argumentsList.includes('--personal'),
        extraction: value('--extraction') ?? 'local',
        retentionDays: Number(value('--retention-days') ?? 30),
        acknowledgeLocalStorage: true,
      };
      break;
    }
    case 'auto-approve': {
      const on = argumentsList.includes('--on');
      const off = argumentsList.includes('--off');
      if (on === off) throw new Error('Informe apenas --on ou --off.');
      const current = await fetch(base + '/v1/memory/policy', { headers });
      if (!current.ok)
        throw new Error('Não foi possível consultar a política.');
      const { revision, ...policy } = await current.json();
      path = '/v1/memory/policy';
      method = 'PUT';
      body = {
        ...policy,
        expectedRevision: revision,
        autoApprove: on,
        acknowledgeLocalStorage: true,
      };
      break;
    }
    case 'create':
      path = '/v1/facts';
      method = 'POST';
      break;
    case 'edit':
    case 'confirm':
      path = '/v1/facts/' + id;
      method = 'PATCH';
      break;
    case 'forget':
      path = '/v1/facts/' + id;
      method = 'DELETE';
      body = {
        expectedVersion: Number(value('--version')),
        eraseSources: argumentsList.includes('--erase-sources'),
      };
      break;
    case 'permit-summary':
      path = '/v1/memory/summaries/' + id;
      method = 'PATCH';
      body = {
        expectedVersion: Number(value('--version')),
        permission: value('--permission') ?? 'local-only',
      };
      break;
    case 'rebuild':
      path = '/v1/conversations/' + id + '/memory/rebuild';
      method = 'POST';
      break;
    default:
      throw new Error(
        'Use status, extractor, configure-extractor, facts, review, consolidate, summaries, graph, conversations, export, configure, auto-approve, create, edit, confirm, forget, permit-summary ou rebuild.',
      );
  }

  if (
    ['edit', 'confirm', 'forget', 'permit-summary', 'rebuild'].includes(
      command,
    ) &&
    !id
  ) {
    throw new Error('Informe --id=UUID.');
  }

  if (['create', 'edit', 'configure-extractor'].includes(command)) {
    const filename = value('--file');

    if (!filename) {
      throw new Error(
        'Informe --file=arquivo.json com o corpo validado da operação.',
      );
    }

    body = JSON.parse(
      (await readFile(filename, 'utf8')).replace(/^\uFEFF/, ''),
    );
    if (
      command === 'configure-extractor' &&
      body.expectedRevision === undefined
    ) {
      const response = await fetch(base + path, { headers });
      if (!response.ok)
        throw new Error('Não foi possível consultar o extrator.');
      body.expectedRevision = (await response.json()).revision;
    }
  }

  if (command === 'confirm') {
    const response = await fetch(base + '/v1/facts', { headers });

    if (!response.ok) {
      throw new Error('Não foi possível consultar os fatos.');
    }

    const fact = (await response.json()).facts.find((entry) => entry.id === id);

    if (!fact) {
      throw new Error('Fato não encontrado.');
    }

    body = {
      text: fact.text,
      category: fact.category,
      dataClass: fact.dataClass,
      relation: fact.relation,
      kind: fact.kind,
      expiresAt: fact.expiresAt,
      supersedes: fact.supersedes,
      permission: value('--permission') ?? fact.permission,
      status: 'confirmed',
      expectedVersion: fact.version,
    };
  }

  const response = await fetch(base + path, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();

  if (!response.ok) {
    console.error(
      JSON.stringify({ code: result.code, error: result.error }, null, 2),
    );
    process.exitCode = 1;
  } else {
    const out = value('--out');

    if (command === 'review') {
      console.log(
        argumentsList.includes('--json')
          ? JSON.stringify({ review: memoryReview(result.facts) }, null, 2)
          : renderMemoryReview(result.facts),
      );
    } else if (command === 'export' && out) {
      const dataDirectory = fileURLToPath(new URL('../data/', import.meta.url));
      const target = resolve(out);
      const pathInData = relative(dataDirectory, target);

      if (
        !pathInData ||
        pathInData.startsWith('..') ||
        isAbsolute(pathInData)
      ) {
        throw new Error(
          'Salve a exportação dentro de api/data/, ignorado pelo Git.',
        );
      }

      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(result, null, 2) + '\n', {
        encoding: 'utf8',
        flag: 'wx',
      });
      console.log('Exportação salva em ' + target);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

await main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Falha ao executar o comando de memória.',
  );
  process.exitCode = 1;
});
