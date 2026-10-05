import { z } from 'zod';
import type { Provider, ProviderOutput } from '../../ports/provider.ts';
import type { ProviderConfig, Role } from '../../domain/providers/model.ts';
import {
  InvalidProviderInputError,
  ProviderConfigurationError,
  ProviderInvalidError,
  ProviderTemporarilyUnavailableError,
  ProviderUnavailableError,
  QuotaExceededError,
} from '../../domain/errors/providers.ts';
import { NoSpeechDetectedError } from '../../domain/errors/voice.ts';
import { NO_CAPABILITIES } from './http-json.ts';

const DeepgramResponse = z.object({
  results: z.object({
    channels: z.array(
      z.object({
        alternatives: z.array(
          z.object({
            transcript: z.string().max(4000),
          }),
        ),
      }),
    ),
  }),
});
const CARTESIA_VERSION = '2026-08-14';
const PCM_SAMPLE_RATE = 16000;
const TTS_SAMPLE_RATE = 24000;
const MAX_AUDIO_BYTES = 960000;
const MAX_TTS_BYTES = 4 * 1024 * 1024;

function providerError(status: number, provider: string): Error {
  if (status === 402 || status === 429) {
    return new QuotaExceededError(`${provider}: cota ou limite excedido.`);
  }

  if (status === 401 || status === 403) {
    return new ProviderConfigurationError(
      `${provider}: credencial ou permissão recusada.`,
    );
  }

  if (status === 400 || status === 404 || status === 422) {
    return new InvalidProviderInputError(
      `${provider}: modelo, voz ou entrada recusada.`,
    );
  }

  if ([408, 500, 502, 503, 504].includes(status)) {
    return new ProviderTemporarilyUnavailableError(
      `${provider}: serviço temporariamente indisponível.`,
    );
  }

  return new ProviderUnavailableError(`${provider}: serviço indisponível.`);
}

function boundedTimeout(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(90000);

  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchResponse(
  url: string | URL,
  init: RequestInit,
  signal?: AbortSignal,
) {
  try {
    return await fetch(url, {
      ...init,
      redirect: 'error',
      signal: boundedTimeout(signal),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ProviderTemporarilyUnavailableError(
        'O provedor de fala excedeu o tempo limite.',
      );
    }

    throw new ProviderTemporarilyUnavailableError(
      'Não foi possível conectar ao provedor de fala.',
    );
  }
}

async function readResponseBytes(response: Response, maximumBytes: number) {
  const reader = response.body?.getReader();

  if (!reader) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        const sizeError = new ProviderInvalidError(
          'Resposta do provedor de fala excedeu o limite.',
        );

        try {
          await reader.cancel(sizeError);
        } catch {
          // Preserve the size-limit error if stream cleanup also fails.
        }

        throw sizeError;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new Uint8Array(
    Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      totalBytes,
    ),
  );
}

async function readResponseJson(response: Response, maximumBytes: number) {
  const bytes = await readResponseBytes(response, maximumBytes);

  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new ProviderInvalidError(
      'O provedor de fala retornou JSON inválido.',
    );
  }
}

function toWav(pcm: Buffer) {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  wav.writeUInt32LE(PCM_SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  return wav;
}

function decodeAudio(
  input: NonNullable<Parameters<Provider['execute']>[0]['audio']>,
) {
  if (
    input.sampleRate !== PCM_SAMPLE_RATE ||
    input.channels !== 1 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input.pcmBase64,
    )
  ) {
    throw new InvalidProviderInputError('O áudio deve ser PCM mono de 16 kHz.');
  }

  const pcm = Buffer.from(input.pcmBase64, 'base64');

  if (
    pcm.length < (PCM_SAMPLE_RATE / 10) * 2 ||
    pcm.length > MAX_AUDIO_BYTES ||
    pcm.length % 2 ||
    pcm.toString('base64') !== input.pcmBase64
  ) {
    throw new InvalidProviderInputError('Duração de áudio inválida.');
  }

  return pcm;
}

function validateTtsText(content: string) {
  const text = content.trim();

  if (!text || text.length > 220) {
    throw new InvalidProviderInputError(
      'Texto TTS deve conter entre 1 e 220 caracteres.',
    );
  }

  return text;
}

export function createDeepgramProvider(
  role: Role,
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  const key = config.apiKeyEnv ? secrets[config.apiKeyEnv] : undefined;

  if (
    role !== 'stt' ||
    config.adapter !== 'deepgram' ||
    !key ||
    !['nova-2', 'nova-3'].includes(config.model ?? '')
  ) {
    throw new ProviderConfigurationError(
      'Deepgram exige uma chave e um modelo STT compatível.',
    );
  }

  const model = config.model;

  return {
    role,
    transport: 'buffered-json',
    nativeStreaming: false,
    async health() {
      try {
        const response = await fetchResponse(
          'https://api.deepgram.com/v1/projects',
          {
            headers: { Authorization: `Token ${key}` },
            method: 'GET',
          },
        );

        if (!response.ok) {
          return { available: false, capabilities: NO_CAPABILITIES };
        }

        await response.body?.cancel();

        return { available: true, capabilities: NO_CAPABILITIES };
      } catch {
        return { available: false, capabilities: NO_CAPABILITIES };
      }
    },
    async execute(input, signal): Promise<ProviderOutput> {
      if (!input.audio) {
        throw new InvalidProviderInputError('O STT exige uma gravação.');
      }

      const wav = toWav(decodeAudio(input.audio));
      const url = new URL('https://api.deepgram.com/v1/listen');
      url.searchParams.set('model', model!);
      url.searchParams.set('language', 'pt');
      url.searchParams.set('smart_format', 'true');
      const response = await fetchResponse(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${key}`,
            'Content-Type': 'audio/wav',
          },
          body: wav,
        },
        signal,
      );

      if (!response.ok) {
        await response.body?.cancel();

        throw providerError(response.status, 'Deepgram');
      }

      const parsed = DeepgramResponse.safeParse(
        await readResponseJson(response, 128 * 1024),
      );
      const transcript =
        parsed.success &&
        parsed.data.results.channels[0]?.alternatives[0]?.transcript;

      if (typeof transcript !== 'string') {
        throw new ProviderInvalidError(
          'Deepgram não retornou uma transcrição válida.',
        );
      }

      if (!transcript.trim()) {
        throw new NoSpeechDetectedError();
      }

      return {
        content: transcript,
        inputTokens: null,
        outputTokens: null,
      };
    },
  };
}

export function createCartesiaProvider(
  role: Role,
  config: ProviderConfig,
  secrets: NodeJS.ProcessEnv,
): Provider {
  const key = config.apiKeyEnv ? secrets[config.apiKeyEnv] : undefined;

  if (
    role !== 'tts' ||
    config.adapter !== 'cartesia' ||
    !key ||
    config.model !== 'sonic-3.6' ||
    !config.voiceId
  ) {
    throw new ProviderConfigurationError(
      'Cartesia exige uma chave, uma voz e o modelo sonic-3.6.',
    );
  }

  const voiceId = config.voiceId;

  return {
    role,
    transport: 'buffered-json',
    nativeStreaming: false,
    async health() {
      try {
        const response = await fetchResponse(
          `https://api.cartesia.ai/voices/${encodeURIComponent(voiceId)}`,
          {
            headers: {
              'X-API-Key': key,
              'Cartesia-Version': CARTESIA_VERSION,
            },
            method: 'GET',
          },
        );

        if (!response.ok) {
          return { available: false, capabilities: NO_CAPABILITIES };
        }

        await response.body?.cancel();

        return {
          available: true,
          capabilities: {
            ...NO_CAPABILITIES,
            customVoice: true,
          },
        };
      } catch {
        return { available: false, capabilities: NO_CAPABILITIES };
      }
    },
    async execute(input, signal): Promise<ProviderOutput> {
      const text = validateTtsText(input.content);
      const response = await fetchResponse(
        'https://api.cartesia.ai/tts/bytes',
        {
          method: 'POST',
          headers: {
            'X-API-Key': key,
            'Cartesia-Version': CARTESIA_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: 'sonic-3.6',
            transcript: text,
            voice: { id: voiceId },
            language: 'pt',
            accent: 'brazilian-portuguese',
            output_format: {
              container: 'raw',
              encoding: 'pcm_s16le',
              sample_rate: TTS_SAMPLE_RATE,
            },
          }),
        },
        signal,
      );

      if (!response.ok) {
        await response.body?.cancel();

        throw providerError(response.status, 'Cartesia');
      }

      const pcm = Buffer.from(await readResponseBytes(response, MAX_TTS_BYTES));

      if (
        pcm.length < (TTS_SAMPLE_RATE / 10) * 2 ||
        pcm.length > MAX_TTS_BYTES ||
        pcm.length % 2
      ) {
        throw new ProviderInvalidError('Cartesia retornou áudio PCM inválido.');
      }

      return {
        content: '',
        inputTokens: null,
        outputTokens: null,
        audio: {
          pcmBase64: pcm.toString('base64'),
          sampleRate: TTS_SAMPLE_RATE,
          channels: 1,
        },
      };
    },
  };
}
