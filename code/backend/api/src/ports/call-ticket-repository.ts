export type TicketScope = {
  ticket: string;
  conversation: string;
  owner: string;
  credential: string;
  origin: string;
};

export interface CallTicketRepository {
  create(scope: TicketScope & { expiresAt: number }): Promise<void>;
  consume(scope: TicketScope & { now?: number }): Promise<boolean>;
}
