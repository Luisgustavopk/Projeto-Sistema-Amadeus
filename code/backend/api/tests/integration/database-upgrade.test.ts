import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

it('atualiza um banco da fase 0 e preserva as conversas existentes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amadeus-upgrade-'));
  const legacy = createClient({ url: 'file::memory:' });
  const db = drizzle(legacy);
  const currentMigrations = fileURLToPath(
    new URL('../../drizzle/', import.meta.url),
  );

  try {
    const migrations = join(root, 'drizzle');
    await mkdir(join(migrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      await readFile(
        new URL('../../drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(
      join(migrations, 'meta/_journal.json'),
      JSON.stringify(journal),
    );

    for (const entry of journal.entries) {
      await copyFile(
        new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        join(migrations, `${entry.tag}.sql`),
      );
    }

    await migrate(drizzle(legacy), { migrationsFolder: migrations });
    await legacy.execute({
      sql: 'INSERT INTO foundation_conversations (id, owner_id, created_at) VALUES (?, ?, ?)',
      args: ['existing-conversation', 'primary', 1],
    });
    await migrate(db, { migrationsFolder: currentMigrations });
    expect((await legacy.execute('SELECT * FROM call_sessions')).rows).toEqual(
      [],
    );
    expect(
      (await legacy.execute('SELECT id FROM foundation_conversations')).rows[0]
        ?.id,
    ).toBe('existing-conversation');
    await migrate(db, { migrationsFolder: currentMigrations });
    expect((await legacy.execute('SELECT * FROM voice_profiles')).rows).toEqual(
      [],
    );
  } finally {
    legacy.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

it('atualiza a primeira versão da memória e preserva fatos, resumos e políticas após reiniciar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amadeus-memory-upgrade-'));
  const legacy = createClient({ url: 'file::memory:' });
  const factId = randomUUID();
  const conversationId = randomUUID();
  const sessionId = randomUUID();
  const jobId = randomUUID();
  const summaryId = randomUUID();
  const subjectId = randomUUID();
  const objectId = randomUUID();
  const filename = join(root, 'legacy.db');

  try {
    const migrations = join(root, 'drizzle');
    await mkdir(join(migrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      await readFile(
        new URL('../../drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 4);
    await writeFile(
      join(migrations, 'meta/_journal.json'),
      JSON.stringify(journal),
    );

    for (const entry of journal.entries) {
      await copyFile(
        new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        join(migrations, `${entry.tag}.sql`),
      );
    }

    await migrate(drizzle(legacy), { migrationsFolder: migrations });
    expect(
      (await legacy.execute('PRAGMA table_info(memory_facts)')).rows.some(
        (row) => row.name === 'search_text',
      ),
    ).toBe(false);
    await legacy.batch(
      [
        {
          sql: 'INSERT INTO foundation_conversations VALUES (?, ?, ?)',
          args: [conversationId, 'primary', 1],
        },
        {
          sql: "INSERT INTO call_sessions VALUES (?, ?, 'primary', NULL, 1, 2, 'closed')",
          args: [sessionId, conversationId],
        },
        {
          sql: "INSERT INTO memory_policy VALUES ('primary', 7, 1, 1, 'local', 30, 2)",
          args: [],
        },
        {
          sql: "INSERT INTO memory_facts VALUES (?, 'primary', 'Prefiro café sem açúcar.', 'preferencia', 'confirmed', 'personal', 'eligible', 2, 'legacy-fingerprint', 'user', 1, 2)",
          args: [factId],
        },
        {
          sql: "INSERT INTO memory_entities VALUES (?, 'primary', 'eu', 'eu'), (?, 'primary', 'café sem açúcar', 'cafe sem acucar')",
          args: [subjectId, objectId],
        },
        {
          sql: "INSERT INTO memory_relations VALUES (?, ?, 'prefere', ?)",
          args: [factId, subjectId, objectId],
        },
        {
          sql: "INSERT INTO memory_jobs(id, owner_id, conversation_id, session_id, idempotency_key, status, created_at) VALUES (?, 'primary', ?, ?, 'legacy-job', 'completed', 1)",
          args: [jobId, conversationId, sessionId],
        },
        {
          sql: "INSERT INTO memory_summaries VALUES (?, 'primary', ?, ?, '[]', 'personal', 1)",
          args: [summaryId, conversationId, jobId],
        },
        {
          sql: "INSERT INTO memory_tombstones VALUES ('primary', 'forgotten-fingerprint', 1)",
          args: [],
        },
      ],
      'write',
    );
    await legacy.execute({ sql: 'VACUUM INTO ?', args: [filename] });

    const script = `
      import { openDatabase } from './src/adapters/database/index.ts';
      import { createMemoryRepository } from './src/adapters/database/memory-repository.ts';
      import { createMemoryService } from './src/application/memory/service.ts';
      import { pathToFileURL } from 'node:url';
      const { client } = await openDatabase(pathToFileURL(process.env.TEST_MEMORY_DATABASE).href);
      try {
        const repository = createMemoryRepository(client, 'primary');
        const service = createMemoryService(repository, {execute: async()=>{throw new Error('Unexpected remote call');}}, ()=>false);
        console.log(JSON.stringify({
          policy: await repository.policy(),
          facts: await repository.facts(),
          summaries: await repository.summaries(),
          context: await service.retrieve('${conversationId}', 'Como prefiro meu café?', 'personal'),
          migrations: (await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')).rows[0].count,
          resumptions: (await client.execute('SELECT COUNT(*) AS count FROM memory_resumptions')).rows[0].count,
          tombstones: (await client.execute('SELECT fingerprint FROM memory_tombstones')).rows,
        }));
      } finally { client.close(); }
    `;
    const run = () =>
      JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          env: { ...process.env, TEST_MEMORY_DATABASE: filename },
          windowsHide: true,
          encoding: 'utf8',
        }),
      );
    const upgraded = run();
    expect(upgraded.policy).toEqual({
      revision: 7,
      enabled: true,
      personalEnabled: true,
      autoApprove: false,
      extraction: 'local',
      retentionDays: 30,
    });
    expect(upgraded.facts).toHaveLength(1);
    expect(upgraded.facts[0]).toMatchObject({
      id: factId,
      text: 'Prefiro café sem açúcar.',
      version: 2,
      status: 'confirmed',
      permission: 'eligible',
      relation: {
        subject: 'usuário',
        predicate: 'prefere',
        object: 'café sem açúcar',
      },
    });
    expect(upgraded.summaries[0]).toMatchObject({
      id: summaryId,
      permission: 'local-only',
      version: 1,
      content: '[]',
    });
    expect(upgraded.context).toContain('Prefiro café sem açúcar.');
    expect(upgraded.migrations).toBe(11);
    expect(upgraded.resumptions).toBe(0);
    expect(upgraded.tombstones).toEqual([
      { fingerprint: 'forgotten-fingerprint' },
    ]);
    expect(run()).toEqual(upgraded);
  } finally {
    legacy.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}, 15000);
