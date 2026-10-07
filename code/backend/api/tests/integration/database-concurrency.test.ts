import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDatabase } from '../../src/adapters/database/index.ts';

it.each(['commit', 'rollback'] as const)(
  'uma entrega concorrente aguarda %s da reserva em SQLite físico sem SQLITE_BUSY',
  async (end) => {
    const directory = await mkdtemp(join(tmpdir(), 'amadeus-db-queue-'));

    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('amadeus-db-queue-')
    ) {
      throw new Error('Unexpected test directory');
    }

    const source = `
      import {openDatabase} from ${JSON.stringify(new URL('../../src/adapters/database/index.ts', import.meta.url).href)};
      const db = await openDatabase('file:' + process.argv[1]);
      try {
        const tx = await db.client.transaction('write');
        await tx.execute("INSERT INTO settings(key,value)VALUES('reservation','pending')");
        let settled = false;
        const delivery = db.client.execute("INSERT INTO settings(key,value)VALUES('text-delivery','sent')").then(() => {settled = true;});
        await new Promise(resolve => setTimeout(resolve,15));
        const waiting = !settled;
        await tx[process.argv[2]](); tx.close(); await delivery;
        const value = (await db.client.execute("SELECT value FROM settings WHERE key='text-delivery'")).rows[0].value;
        const reservations = (await db.client.execute("SELECT value FROM settings WHERE key='reservation'")).rows.length;
        let rejected = false;
        try {await db.client.execute('SELECT * FROM missing_table');}catch {rejected = true;}
        const valid = (await db.client.execute('SELECT 1 AS valid')).rows[0].valid;
        console.log(JSON.stringify({waiting,value,reservations,rejected,valid}));
      } finally {db.client.close();}
    `;

    try {
      const result = await promisify(execFile)(process.execPath, [
        '--input-type=module',
        '-e',
        source,
        join(directory, 'test.db'),
        end,
      ]);
      expect(JSON.parse(result.stdout)).toEqual({
        waiting: true,
        value: 'sent',
        reservations: end === 'commit' ? 1 : 0,
        rejected: true,
        valid: 1,
      });
    } finally {
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);

it('fechar o cliente libera opera??es pendentes sem deixar a fila presa', async () => {
  const db = await openDatabase('file::memory:');
  const tx = await db.client.transaction('write');
  const pending = db.client.execute('SELECT 1');
  db.client.close();
  await expect(pending).rejects.toMatchObject({ code: 'CLIENT_CLOSED' });
  tx.close();
});
