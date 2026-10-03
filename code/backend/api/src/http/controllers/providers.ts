import type { FastifyRequest } from 'fastify';
import type { ProviderHttpServices } from '../dependencies.ts';
import type { ProvidersConfig } from '../../domain/providers/model.ts';
import { PROVIDER_PROTOCOL } from '../contracts/provider-protocol.ts';

export function createProvidersController({ providers }: ProviderHttpServices) {
  return {
    usage: async () => ({
      period: 'UTC-day' as const,
      automaticPaidFallback: false as const,
      providers: await providers.usage(),
    }),
    getProviders: async () => providers.getConfiguration(),
    configureProviders: async (
      request: FastifyRequest<{ Body: ProvidersConfig }>,
    ) => providers.configure(request.body),
    providerProtocol: async () => PROVIDER_PROTOCOL,
  };
}
