import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type { ProviderFactory } from '../../ports/provider.ts';
import type {
  ConfigurationGate,
  ExecutionGate,
} from '../../ports/activity-gate.ts';
import { createProviderConfiguration } from './configuration.ts';
import { createProviderExecution } from './execution.ts';
import { createProviderQueries } from './queries.ts';

export function createProviderServices(dependencies: {
  configuration: ProviderConfigurationRepository;
  usage: ProviderUsageRepository;
  ownerId: string;
  factory: ProviderFactory;
  gate: ConfigurationGate & ExecutionGate;
}) {
  const { configuration, usage, ownerId, factory, gate } = dependencies;

  return {
    ...createProviderConfiguration(configuration, ownerId, factory, gate),
    ...createProviderExecution(configuration, usage, ownerId, factory, gate),
    ...createProviderQueries(configuration, usage, ownerId, factory),
  };
}

export type ProviderServices = ReturnType<typeof createProviderServices>;
