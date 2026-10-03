import {
  ProviderUnavailableError,
  ProviderInvalidError,
  ProviderConfigurationError,
  ProviderDisabledError,
} from '../../domain/errors/providers.ts';
import { ApplicationError } from '../../domain/errors/application-error.ts';
import { z } from 'zod';
import type { Provider } from '../../ports/provider.ts';
import {
  type ProviderConfig,
  type Role,
} from '../../domain/providers/model.ts';

const Capabilities = z.strictObject({
  incrementalGeneration: z.boolean(),
  progressiveDelivery: z.boolean(),
  vision: z.boolean(),
  customVoice: z.boolean(),
  testedVoiceControls: z.array(z.string().max(64)).max(32),
});
const Health = z.strictObject({
  protocolVersion: z.literal('1.0'),
  role: z.enum(['llm', 'stt', 'tts']),
  status: z.literal('ok'),
  capabilities: Capabilities,
});
const Output = z.strictObject({
  content: z.string().max(65536),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});
export const NO_CAPABILITIES = {
  incrementalGeneration: false,
  progressiveDelivery: false,
  vision: false,
  customVoice: false,
  testedVoiceControls: [],
};

async function boundedJson(response: Response) {
  if (!response.ok) {
    throw new ProviderUnavailableError(
      'O serviço do adaptador está indisponível.',
    );
  }

  if (!response.body) {
    throw new ProviderInvalidError('Resposta inválida do adaptador.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        break;
      }

      length += next.value.byteLength;

      if (length > 131072) {
        throw new ProviderInvalidError(
          'Resposta do adaptador excedeu o limite.',
        );
      }

      chunks.push(next.value);
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}

export function createProvider(
  role: Role,
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  const key = config.apiKeyEnv ? secrets[config.apiKeyEnv] : undefined;

  if (config.apiKeyEnv && !key) {
    throw new ProviderConfigurationError(
      'A variável de segredo do adaptador não foi configurada.',
    );
  }

  const request = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ) => {
    if (config.adapter === 'disabled') {
      throw new ProviderDisabledError('O adaptador está desabilitado.');
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (key) {
      headers.authorization = `Bearer ${key}`;
    }

    return boundedJson(
      await fetch(`${config.endpoint!.replace(/\/$/, '')}${path}`, {
        ...init,
        headers,
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      }),
    );
  };

  return {
    role,
    transport: 'buffered-json',
    nativeStreaming: false,
    async health() {
      if (config.adapter === 'disabled') {
        return { available: false, capabilities: NO_CAPABILITIES };
      }

      try {
        const result = Health.parse(await request('/health'));

        if (result.role !== role) {
          return { available: false, capabilities: NO_CAPABILITIES };
        }

        return { available: true, capabilities: result.capabilities };
      } catch {
        return { available: false, capabilities: NO_CAPABILITIES };
      }
    },
    async execute(input, signal) {
      try {
        return Output.parse(
          await request(
            '/execute',
            {
              method: 'POST',
              body: JSON.stringify({
                protocolVersion: '1.0',
                role,
                model: config.model ?? null,
                ...input,
              }),
            },
            signal,
          ),
        );
      } catch (error) {
        if (error instanceof ApplicationError) {
          throw error;
        }

        throw new ProviderUnavailableError(
          'Não foi possível executar o adaptador.',
        );
      }
    },
  };
}
