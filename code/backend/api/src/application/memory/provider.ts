import {
  MemoryExtractorConfigurationSchema,
  MemoryExtractorEditSchema,
  type MemoryExtractorConfiguration,
} from '../../domain/memory/extractor.ts';
import {
  DEFAULT_PROVIDERS,
  type ProviderConfig,
} from '../../domain/providers/model.ts';
import {
  ProviderBusyError,
  ProviderConfigurationError,
  InvalidProviderInputError,
} from '../../domain/errors/providers.ts';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import type { ProviderConfigurationRepository } from '../../ports/provider-configuration-repository.ts';
import type { ProviderUsageRepository } from '../../ports/provider-usage-repository.ts';
import type { ProviderFactory } from '../../ports/provider.ts';
import type {
  ConfigurationGate,
  ExecutionGate,
} from '../../ports/activity-gate.ts';
import { createProviderExecution } from '../providers/execution.ts';
import { configuredProviderAttempts } from '../providers/routing.ts';

export function createMemoryProvider(dependencies: {
  revisions: RevisionRepository;
  conversationConfiguration: ProviderConfigurationRepository;
  usage: ProviderUsageRepository;
  ownerId: string;
  factory: ProviderFactory;
  gate: ConfigurationGate & ExecutionGate;
}) {
  const {
    revisions,
    conversationConfiguration,
    usage,
    ownerId,
    factory,
    gate,
  } = dependencies;
  const key = `memory-extractor:${ownerId}`;
  const usageOwner = `${ownerId}:memory`;
  const initial: MemoryExtractorConfiguration = {
    revision: 0,
    freeOnly: true,
    provider: DEFAULT_PROVIDERS.llm,
    updatedAt: null,
  };

  async function get() {
    const raw = await revisions.read(key);

    return raw
      ? MemoryExtractorConfigurationSchema.parse(JSON.parse(raw))
      : structuredClone(initial);
  }

  async function assertIndependent(provider: ProviderConfig) {
    const conversation = (await conversationConfiguration.get(ownerId)).llm;

    if (
      provider.adapter !== 'disabled' &&
      configuredProviderAttempts('llm', conversation).some(
        (p) =>
          p.adapter === provider.adapter &&
          p.model === provider.model &&
          p.endpoint === provider.endpoint,
      )
    ) {
      throw new ProviderConfigurationError(
        'O modelo do extrator também está configurado na conversa; escolha outro modelo.',
      );
    }
  }

  const configuration: ProviderConfigurationRepository = {
    async get() {
      const current = await get();
      await assertIndependent(current.provider);

      return { ...structuredClone(DEFAULT_PROVIDERS), llm: current.provider };
    },
    async save() {
      throw new ProviderConfigurationError(
        'Configure a memória pela rota própria.',
      );
    },
  };
  const execution = createProviderExecution(
    configuration,
    usage,
    usageOwner,
    factory,
    gate,
    undefined,
    undefined,
    { reserveConversationCapacity: false },
  );

  return {
    get,
    async configure(input: unknown) {
      const edit = MemoryExtractorEditSchema.parse(input);
      const release = gate.beginConfiguration();

      try {
        await assertIndependent(edit.provider);

        if (edit.provider.adapter !== 'disabled') {
          factory('llm', edit.provider);
        }

        const raw = await revisions.read(key);
        const current = raw
          ? MemoryExtractorConfigurationSchema.parse(JSON.parse(raw))
          : initial;

        if (current.revision !== edit.expectedRevision) {
          throw new ProviderBusyError(
            'O extrator mudou; consulte a revisão atual.',
          );
        }

        const next = {
          revision: current.revision + 1,
          freeOnly: true as const,
          provider: edit.provider,
          updatedAt: new Date().toISOString(),
        };

        if (!(await revisions.compareAndSave(key, raw, JSON.stringify(next)))) {
          throw new ProviderBusyError('O extrator mudou simultaneamente.');
        }

        return next;
      } finally {
        release();
      }
    },
    async describeMemory() {
      const configuration = await get();

      return {
        configuration,
        usage: await usage.usage(usageOwner, 'llm', configuration.provider),
      };
    },
    async execute(...args: Parameters<typeof execution.execute>) {
      if (args[0] !== 'llm' || args[1].purpose !== 'memory') {
        throw new InvalidProviderInputError(
          'O extrator aceita apenas trabalhos de memória.',
        );
      }

      return execution.execute(...args);
    },
  };
}

export type MemoryProvider = ReturnType<typeof createMemoryProvider>;
