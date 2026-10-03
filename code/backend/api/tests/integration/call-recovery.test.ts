import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { SqliteConversationRepository } from '../../src/adapters/database/conversation-repository.ts';
import { createConversationService } from '../../src/application/conversations/create.ts';
import { createSqliteCallHistory } from '../../src/adapters/database/call-history-repository.ts';
import { recoverInterruptedCalls } from '../../src/adapters/database/recover-calls.ts';

it('recupera sessão interrompida e cria uma única tarefa pendente', async () => {
  const db = await openDatabase('file::memory:');

  try {
    const conversations = createConversationService(
      new SqliteConversationRepository(db.client),
      'primary',
    );
    const conversation = await conversations.create();
    const history = createSqliteCallHistory(db.client);
    const sessionId = randomUUID();
    await history.startSession({
      id: sessionId,
      conversationId: conversation.id,
      ownerId: 'primary',
      voiceProfileId: null,
    });
    await history.beginTurn({
      id: randomUUID(),
      sessionId,
      conversationId: conversation.id,
      clientTurnId: 1,
      responseId: randomUUID(),
      dataClass: 'synthetic',
    });
    await recoverInterruptedCalls(db.client);
    await recoverInterruptedCalls(db.client);
    expect(
      (await db.client.execute('SELECT state FROM call_sessions')).rows[0]
        ?.state,
    ).toBe('disconnected');
    expect(
      (await db.client.execute('SELECT status FROM call_turns')).rows[0]
        ?.status,
    ).toBe('interrupted');
    expect(
      (await db.client.execute('SELECT * FROM memory_work_pending')).rows,
    ).toHaveLength(1);
  } finally {
    db.client.close();
  }
});
