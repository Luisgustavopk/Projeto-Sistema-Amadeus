import { NoSpeechDetectedError } from '../../domain/errors/voice.ts';
import {
  ProviderUnavailableError,
  ProviderInvalidError,
  ProviderConfigurationError,
  ProviderDisabledError,
  ProviderBusyError,
  InvalidProviderInputError,
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
  audio: z
    .strictObject({
      pcmBase64: z.string().max(4194304),
      sampleRate: z.literal(16000),
      channels: z.literal(1),
    })
    .optional(),
});
export const NO_CAPABILITIES = {
  incrementalGeneration: false,
  progressiveDelivery: false,
  vision: false,
  customVoice: false,
  testedVoiceControls: [],
};

async function boundedJson(response: Response, limit: number, role?: Role) {
  if (response.status === 422 && role === 'stt') {
    const failure = await boundedJson(new Response(response.body), 4096);

    if (
      failure &&
      typeof failure === 'object' &&
      'code' in failure &&
      failure.code === 'NO_SPEECH_DETECTED'
    ) {
      throw new NoSpeechDetectedError();
    }

    throw new ProviderInvalidError('Entrada recusada pelo STT.');
  }

  if (response.status === 429 && role !== 'llm') {
    await response.body?.cancel();

    throw new ProviderBusyError(
      'O serviço de fala ainda está processando uma solicitação.',
    );
  }

  if (response.status === 400 && role !== 'llm') {
    await response.body?.cancel();

    throw new InvalidProviderInputError(
      'O serviço de fala recusou os dados de entrada.',
    );
  }

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

      if (length > limit) {
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
          ? AbortSignal.any([
              signal,
              AbortSignal.timeout(
                path === '/execute' ? (role === 'llm' ? 30000 : 90000) : 10000,
              ),
            ])
          : AbortSignal.timeout(
              path === '/execute' ? (role === 'llm' ? 30000 : 90000) : 10000,
            ),
      }),
      role === 'tts' ? 4194304 : 131072,
      role,
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
        const output = Output.parse(
          await request(
            '/execute',
            {
              method: 'POST',
              body: JSON.stringify({
                protocolVersion: '1.0',
                role,
                model: config.model ?? null,
                ...input,
                systemPrompt: undefined,
                content: input.systemPrompt
                  ? `${input.systemPrompt}\n${input.content}`
                  : input.content,
              }),
            },
            signal,
          ),
        );

        return {
          ...output,
          ...(output.audio ? { audio: output.audio } : {}),
        } as import('../../ports/provider.ts').ProviderOutput;
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
