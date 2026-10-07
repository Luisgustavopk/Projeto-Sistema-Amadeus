import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../src/adapters/database/index.ts';
import { createSqliteCallHistory } from '../../src/adapters/database/call-history-repository.ts';
import { SqliteConversationRepository } from '../../src/adapters/database/conversation-repository.ts';
import { buildVoiceContext } from '../../src/application/voice/context.ts';
import { buildHistoryContext } from '../../src/application/voice/history-context.ts';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((close) => close()));

it('mantém opções enviadas após falha de áudio sem afirmar audição ou promover rascunhos', async () => {
  const db = await openDatabase('file::memory:');
  cleanup.push(() => db.client.close());
  const conversation = await new SqliteConversationRepository(db.client).create(
    'primary',
  );
  const history = createSqliteCallHistory(db.client);
  const sessionId = randomUUID();
  const responseId = randomUUID();
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
    responseId,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  const choices = '1. Um jogo de investigação. 2. Um filme de suspense.';
  await history.updateTurn(responseId, {
    userText: 'Um jogo ou um filme?',
    generatedText: choices + ' Rascunho rejeitado.',
    status: 'failed',
  });
  const sent = randomUUID();
  await history.addSegment({
    id: sent,
    responseId,
    position: 0,
    text: choices,
  });
  await history.markTextSent!(sent);
  await history.addSegment({
    id: randomUUID(),
    responseId,
    position: 1,
    text: 'Rascunho rejeitado.',
  });
  const recent = await history.recent(conversation.id, 'primary', 12);
  expect(recent[0]).toMatchObject({
    sentText: choices,
    generatedText: '',
    responseStatus: 'failed',
  });
  const context = buildVoiceContext(
    recent,
    '1',
    'synthetic',
    undefined,
    undefined,
    true,
  );
  expect(context.history).toEqual([
    { role: 'user', content: 'Um jogo ou um filme?' },
    { role: 'assistant', content: choices },
  ]);
  expect(JSON.stringify(context)).not.toContain('Rascunho rejeitado');
  expect(buildHistoryContext(recent)[0]?.assistantConfirmed).toBe('');
  expect(buildHistoryContext(recent)[0]).not.toHaveProperty('assistantSent');
  expect(await history.recent(conversation.id, 'other-owner', 12)).toEqual([]);
  expect(await history.familiarity!('primary', 'synthetic')).toBe(1);
  expect(await history.familiarity!('other-owner', 'personal')).toBe(0);
  await db.client.execute({
    sql: "UPDATE call_turns SET data_class = 'personal' WHERE response_id = ?",
    args: [responseId],
  });
  expect(await history.familiarity!('primary', 'synthetic')).toBe(0);
  expect(await history.familiarity!('primary', 'personal')).toBe(1);
  const nextConversation = await new SqliteConversationRepository(
    db.client,
  ).create('primary');
  const nextSession = randomUUID(),
    nextResponse = randomUUID(),
    nextSegment = randomUUID();
  await history.startSession({
    id: nextSession,
    conversationId: nextConversation.id,
    ownerId: 'primary',
    voiceProfileId: null,
  });
  await history.beginTurn({
    id: randomUUID(),
    sessionId: nextSession,
    conversationId: nextConversation.id,
    responseId: nextResponse,
    clientTurnId: 1,
    dataClass: 'synthetic',
  });
  await history.updateTurn(nextResponse, {
    userText: 'Voltei.',
    status: 'completed',
  });
  await history.addSegment({
    id: nextSegment,
    responseId: nextResponse,
    position: 0,
    text: 'Oi.',
  });
  await history.markTextSent!(nextSegment);
  expect(await history.familiarity!('primary', 'personal')).toBe(2);
  expect(await history.familiarity!('primary', 'synthetic')).toBe(1);
  expect(await history.recent(nextConversation.id, 'primary', 12)).toHaveLength(
    1,
  );
});
