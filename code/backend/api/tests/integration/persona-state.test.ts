import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createRevisionRepository } from '../../src/adapters/database/revision-repository.ts';
import { createPersistentPersonaState } from '../../src/application/persona/persistent-state.ts';

const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach((fn) => fn()));
const expression = {
  intent: 'conversar' as const,
  emotion: 'alegria_discreta' as const,
  intensity: 0.7,
};
it('preserva estado depois de reiniciar o processo que usa o arquivo SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'amadeus-persona-state-'));

  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('amadeus-persona-state-')
  ) {
    throw new Error('Unexpected test directory');
  }

  const file = join(directory, 'state.db');
  const source = `
    import {openDatabase} from ${JSON.stringify(new URL('../../src/adapters/database/index.ts', import.meta.url).href)};
    import {createRevisionRepository} from ${JSON.stringify(new URL('../../src/adapters/database/revision-repository.ts', import.meta.url).href)};
    import {createPersistentPersonaState} from ${JSON.stringify(new URL('../../src/application/persona/persistent-state.ts', import.meta.url).href)};
    const db = await openDatabase('file:' + process.argv[1]);
    try {
      const state = createPersistentPersonaState(createRevisionRepository(db.client), 'owner');
      if (process.argv[2] === 'save') await state.observe('personal', 'saved', {intent:'conversar',emotion:'alegria_discreta',intensity:0.7});
      console.log(JSON.stringify(await state.snapshot('personal')));
    } finally { db.client.close(); }
  `;
  const run = async (mode: string) =>
    JSON.parse(
      (
        await promisify(execFile)(process.execPath, [
          '--input-type=module',
          '-e',
          source,
          file,
          mode,
        ])
      ).stdout,
    );

  try {
    expect(await run('save')).toMatchObject({ interactions: 1 });
    expect(await run('read')).toMatchObject({
      interactions: 1,
      familiarity: 'F0',
    });
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}, 15000);
it('reabre estado pelo mesmo SQLite, isola proprietário/classificação e retorna gradualmente ao equilíbrio', async () => {
  const db = await openDatabase('file::memory:');
  closes.push(() => db.client.close());
  let time = 100000;
  const repository = createRevisionRepository(db.client);
  const state = createPersistentPersonaState(repository, 'owner', () => time);
  const initial = await state.snapshot('personal');
  await state.observe('personal', 'r1', expression);
  await state.observe('personal', 'r1', expression);
  const saved = await createPersistentPersonaState(
    repository,
    'owner',
    () => time,
  ).snapshot('personal');
  expect(saved.interactions).toBe(1);
  expect(saved.pleasure).toBeGreaterThan(initial.pleasure);
  expect(saved.pleasure).toBeLessThanOrEqual(0.08);
  expect((await state.snapshot('synthetic')).interactions).toBe(0);
  expect(
    (
      await createPersistentPersonaState(
        repository,
        'other',
        () => time,
      ).snapshot('personal')
    ).interactions,
  ).toBe(0);
  time += 6 * 60 * 60 * 1000;
  const decayed = await state.snapshot('personal');
  expect(decayed.pleasure).toBeCloseTo(saved.pleasure / 2, 2);
  expect(decayed.energy).toBeGreaterThan(saved.energy);
  await state.reset('personal');
  expect(await state.snapshot('personal')).toMatchObject({
    interactions: 0,
    pleasure: 0,
    energy: 0.65,
  });
});
it('atualizações concorrentes não perdem interações; F1/F2 não exigem aprovação de fatos', async () => {
  const db = await openDatabase('file::memory:');
  closes.push(() => db.client.close());
  const repository = createRevisionRepository(db.client);
  const a = createPersistentPersonaState(repository, 'owner'),
    b = createPersistentPersonaState(repository, 'owner');
  await Promise.all([
    a.observe('personal', 'a', expression),
    b.observe('personal', 'b', expression),
  ]);
  await a.observe('personal', 'c', expression);
  expect(await b.snapshot('personal')).toMatchObject({
    interactions: 3,
    familiarity: 'F1',
  });

  for (let i = 0; i < 7; i++) {
    await a.observe('personal', 'id-' + i, expression);
  }

  expect(await b.snapshot('personal')).toMatchObject({
    interactions: 10,
    familiarity: 'F2',
  });
});
