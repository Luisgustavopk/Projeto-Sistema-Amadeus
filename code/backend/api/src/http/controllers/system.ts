import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SystemHttpServices } from '../dependencies.ts';
import { VOICE_PROTOCOL } from '../../realtime/protocol/index.ts';

export function createSystemController(
  app: FastifyInstance,
  context: SystemHttpServices,
) {
  const { health, providers, metrics, activity, ticketTtlSeconds } = context;

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
    }),

    voiceProtocol: async () => ({
      ...VOICE_PROTOCOL,
      authentication: {
        ...VOICE_PROTOCOL.authentication,
        configuredTtlSeconds: ticketTtlSeconds,
      },
    }),

    capabilities: async () => ({
      voice: false,
      customVoice: false,
      vision: false,
      memory: false,
      live2d: false,
      desktop: false,
      protocolVersion: '1.0' as const,
      foundationChannel: true as const,
      providers: await providers.describe(),
    }),

    openapi: async () => app.swagger(),
  };
}
