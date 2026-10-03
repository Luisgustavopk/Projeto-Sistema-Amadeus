import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SystemHttpServices } from '../dependencies.ts';
import { VOICE_PIPELINE_PROTOCOL } from '../../realtime/protocol/voice-description.ts';
import { VOICE_PROTOCOL } from '../../realtime/protocol/index.ts';

export function createSystemController(
  app: FastifyInstance,
  context: SystemHttpServices,
) {
  const { health, metrics, activity, ticketTtlSeconds } = context;

  return {
    health: async () => ({
      status: 'ok' as const,
      service: 'amadeus-api' as const,
    }),

    preflight: async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.code(204).send(),

    healthDetails: async () => health.details(),

    metrics: async () => ({
      ...metrics,
      activeConnections: activity.activeCalls,
      uptimeSeconds: process.uptime(),
      residentMemoryBytes: process.memoryUsage().rss,
      voice: context.voiceMetrics.snapshot(),
    }),

    voiceProtocol: async () => ({
      ...VOICE_PROTOCOL,
      voicePipeline: VOICE_PIPELINE_PROTOCOL,
      authentication: {
        ...VOICE_PROTOCOL.authentication,
        configuredTtlSeconds: ticketTtlSeconds,
      },
    }),

    capabilities: async () => ({
      ...(await context.voiceCapabilities.inspect()),
      voiceProtocolVersion: '1.1' as const,
      vision: false,
      memory: false,
      live2d: false,
      desktop: false,
      protocolVersion: '1.0' as const,
      foundationChannel: true as const,
    }),

    openapi: async () => app.swagger(),
  };
}
