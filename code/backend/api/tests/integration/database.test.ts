import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);

it('preserva dados e reaplica migrações após reiniciar o processo', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'amadeus-test-'));
  const url = pathToFileURL(join(folder, 'test.db')).href;
  const prefix = `
    import { openDatabase } from './src/adapters/database/index.ts';
    import { settings } from './src/adapters/database/schema.ts';
    import { SqliteConversationRepository } from './src/adapters/database/conversation-repository.ts';
    import { SqliteCallTicketRepository } from './src/adapters/database/call-ticket-repository.ts';
    import { SqliteProviderConfigurationRepository } from './src/adapters/database/provider-configuration-repository.ts';
    import { SqliteProviderUsageRepository } from './src/adapters/database/provider-usage-repository.ts';
    import { DEFAULT_PROVIDERS, ProvidersSchema } from './src/domain/providers/model.ts';
    const { db, client } = await openDatabase(process.env.TEST_DATABASE_URL);
    const conversations = new SqliteConversationRepository(client);
    const tickets = new SqliteCallTicketRepository(client);
    const configuration = new SqliteProviderConfigurationRepository(client);
    const usageRepository = new SqliteProviderUsageRepository(client);
  `;

  async function run(operation: string) {
    return exec(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `${prefix}\ntry { ${operation} } finally { client.close(); }`,
      ],
      {
        env: { ...process.env, TEST_DATABASE_URL: url },
        windowsHide: true,
      },
    );
  }

  try {
    await run(
      `await db.insert(settings).values({ key: 'test', value: 'preserved' });
       const conversation = await conversations.create('primary');
       await db.insert(settings).values({ key: 'conversation', value: conversation.id });
       const config = ProvidersSchema.parse({...DEFAULT_PROVIDERS, llm: {adapter: 'http-json', endpoint: 'http://127.0.0.1:9999', limits: {requestsPerDay: 2, tokensPerDay: 1000}}});
       await configuration.save('primary',config);
       const reservation = await usageRepository.reserve('primary','llm',config.llm,20);
       await usageRepository.settle(reservation,{inputTokens:3,outputTokens:2});
       await tickets.create({ticket:'restart-test-ticket',conversation:conversation.id,owner:'primary',credential:'test-credential',origin:'http://localhost:5173',expiresAt:Date.now()+60000});
       await tickets.consume({ticket:'restart-test-ticket',conversation:conversation.id,owner:'primary',credential:'test-credential',origin:'http://localhost:5173'});`,
    );
    const result = await run(
      `const config = await configuration.get('primary');
       const rows = await db.select().from(settings);
       const id = rows.find(row => row.key === 'conversation').value;
       const usage = await usageRepository.usage('primary','llm',config.llm);
       const reused = await tickets.consume({ticket:'restart-test-ticket',conversation:id,owner:'primary',credential:'test-credential',origin:'http://localhost:5173'});
       console.log(JSON.stringify({setting:rows.find(row => row.key === 'test').value,adapter:config.llm.adapter,requests:usage.requests,budgetTokens:usage.budgetTokens,reused,owner:await conversations.belongsTo(id,'primary'),otherOwner:await conversations.belongsTo(id,'another-owner')}));`,
    );
    expect(JSON.parse(result.stdout)).toEqual({
      setting: 'preserved',
      adapter: 'http-json',
      requests: 1,
      budgetTokens: 5,
      reused: false,
      owner: true,
      otherOwner: false,
    });
  } finally {
    await rm(folder, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}, 15000);
