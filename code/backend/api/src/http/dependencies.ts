import type { ProviderServices } from '../application/providers/index.ts';
import type { createConversationService } from '../application/conversations/create.ts';
import type { TicketService } from '../application/calls/tickets.ts';
import type { createHealthService } from '../application/diagnostics/health.ts';
import type { CallGate } from '../ports/activity-gate.ts';
import type { HttpMetrics } from './observability/metrics.ts';

export type ProviderHttpServices = {
  providers: Pick<ProviderServices, 'getConfiguration' | 'configure' | 'usage'>;
};
export type ConversationHttpServices = {
  conversations: ReturnType<typeof createConversationService>;
  tickets: Pick<TicketService, 'issue'>;
};
export type SystemHttpServices = {
  health: ReturnType<typeof createHealthService>;
  providers: Pick<ProviderServices, 'describe'>;
  metrics: HttpMetrics;
  activity: Pick<CallGate, 'activeCalls'>;
  ticketTtlSeconds: number;
};

export type HttpServices = ProviderHttpServices &
  ConversationHttpServices &
  SystemHttpServices;
