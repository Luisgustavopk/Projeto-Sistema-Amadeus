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
export type VoiceHttpServices = {
  persona: ReturnType<
    typeof import('../application/persona/configuration.ts').createPersonaConfiguration
  >;
  voiceVersions: ReturnType<
    typeof import('../application/voice/versions.ts').createVoiceVersions
  >;
  voiceProfiles: import('../application/voice/profiles.ts').VoiceProfiles;
};
export type SystemHttpServices = {
  voiceCapabilities: ReturnType<
    typeof import('../application/voice/capabilities.ts').createVoiceCapabilities
  >;
  voiceMetrics: import('../application/voice/metrics.ts').VoiceMetrics;
  health: ReturnType<typeof createHealthService>;
  providers: Pick<ProviderServices, 'describe'>;
  metrics: HttpMetrics;
  activity: Pick<CallGate, 'activeCalls'>;
  ticketTtlSeconds: number;
};

export type HttpServices = ProviderHttpServices &
  ConversationHttpServices &
  SystemHttpServices &
  VoiceHttpServices & {
    memory: import('../application/memory/service.ts').MemoryService;
    memoryProvider: import('../application/memory/provider.ts').MemoryProvider;
  };
