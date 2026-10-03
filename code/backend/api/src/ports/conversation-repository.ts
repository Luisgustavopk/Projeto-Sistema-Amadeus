export type Conversation = { id: string; createdAt: string };

export interface ConversationRepository {
  create(ownerId: string): Promise<Conversation>;
  belongsTo(id: string, ownerId: string): Promise<boolean>;
}
