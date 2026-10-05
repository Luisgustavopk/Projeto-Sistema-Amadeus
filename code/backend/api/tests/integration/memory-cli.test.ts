import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
const script = new URL('../../scripts/memory.mjs', import.meta.url);
const env = {
  ...process.env,
  API_ACCESS_TOKEN: 'synthetic-cli-credential-over-32-characters',
};

const fact = {
  id: '22222222-2222-4222-8222-222222222222',
  text: 'Prefiro chá.',
  category: 'preferencia',
  relation: null,
  dataClass: 'synthetic',
  status: 'suggested',
  permission: 'local-only',
  version: 7,
  kind: 'fact',
  expiresAt: null,
  supersedes: null,
};

it('liga e desliga a aprovação automática conservando o extrator e a retenção', async () => {
  let policy = {
    revision: 3,
    enabled: true,
    personalEnabled: true,
    extraction: 'llm',
    retentionDays: 30,
    autoApprove: false,
  };
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');

    if (req.method === 'PUT') {
      let raw = '';

      for await (const chunk of req) {
        raw += chunk;
      }

      const { expectedRevision, acknowledgeLocalStorage, ...edit } =
        JSON.parse(raw);
      expect(expectedRevision).toBe(policy.revision);
      expect(acknowledgeLocalStorage).toBe(true);
      policy = { ...edit, revision: policy.revision + 1 };
    }

    res.end(JSON.stringify(policy));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Invalid address');
    }

    const run = (...args: string[]) =>
      exec(
        process.execPath,
        [
          fileURLToPath(script),
          'auto-approve',
          ...args,
          '--api=http://127.0.0.1:' + address.port,
        ],
        { env, windowsHide: true },
      );

    for (const flag of ['--on', '--off']) {
      const updated = JSON.parse((await run(flag)).stdout);
      expect(updated).toMatchObject({
        enabled: true,
        personalEnabled: true,
        extraction: 'llm',
        retentionDays: 30,
        autoApprove: flag === '--on',
      });
    }

    const invalid = await run('--on', '--off').catch((error) => error);
    expect(invalid.stderr).toContain('apenas --on ou --off');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('mostra comandos com IDs reais e conserva a permissão na confirmação padrão', async () => {
  let confirmed: Record<string, unknown> | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');

    if (req.method === 'PATCH') {
      let raw = '';

      for await (const chunk of req) {
        raw += chunk;
      }

      confirmed = JSON.parse(raw);
      res.end(JSON.stringify({ ...fact, ...confirmed }));
    } else if (req.url === '/v1/memory/status') {
      res.end(
        JSON.stringify({
          policy: { autoApprove: true },
          jobs: [{ status: 'pending', lastError: 'QUOTA_EXCEEDED' }],
        }),
      );
    } else {
      res.end(JSON.stringify({ facts: [fact] }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Invalid address');
    }

    const api = '--api=http://127.0.0.1:' + address.port;
    const run = (...args: string[]) =>
      exec(process.execPath, [fileURLToPath(script), ...args, api], {
        env,
        windowsHide: true,
      });
    const review = await run('review');
    expect(review.stdout).toContain(
      `confirm --id=${fact.id} --permission=eligible`,
    );
    expect(review.stdout).toContain('ainda não entra no contexto');
    expect(review.stdout).toContain('aguardando cota do extrator');
    const json = JSON.parse((await run('review', '--json')).stdout);
    expect(json.review[0].state).toBe('needs-confirmation');
    expect(json.processing.jobs[0].lastError).toBe('QUOTA_EXCEEDED');
    await run('confirm', '--id=' + fact.id);
    expect(confirmed).toMatchObject({
      expectedVersion: 7,
      permission: 'local-only',
      status: 'confirmed',
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('explica o marcador de ID sem stack trace e oferece ajuda sem API', async () => {
  const run = (...args: string[]) =>
    exec(process.execPath, [fileURLToPath(script), ...args], {
      env,
      windowsHide: true,
    });
  const failed = await run('confirm', '--id=ID_DO_FATO').catch(
    (error) => error,
  );
  expect(failed.code).toBe(1);
  expect(failed.stderr).toContain('npm run memory -- review');
  expect(failed.stderr).not.toContain('ModuleJob');
  expect((await run('--help')).stdout).toContain('IDs reais');
});
