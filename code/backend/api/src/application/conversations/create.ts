import type { ConversationRepository } from '../../ports/conversation-repository.ts';

export function createConversationService(
  repository: ConversationRepository,
  ownerId: string,
) {
  return { create: () => repository.create(ownerId) };
}
