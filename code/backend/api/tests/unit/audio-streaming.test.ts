import { expect, it, vi } from 'vitest';
import { createAudioStreaming } from '../../src/application/providers/audio-streaming.ts';
import {
  ProvidersSchema,
  DEFAULT_PROVIDERS,
} from '../../src/domain/providers/model.ts';
import {
  ProviderTemporarilyUnavailableError,
  QuotaExceededError,
} from '../../src/domain/errors/providers.ts';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import type {
  ProviderFactory,
  ProviderOutput,
} from '../../src/ports/provider.ts';

it.each([
  { partial: false, failure: 'temporary', separateAccount: false },
  { partial: true, failure: 'temporary', separateAccount: false },
  { partial: false, failure: 'quota', separateAccount: false },
  { partial: false, failure: 'quota', separateAccount: true },
  { partial: false, failure: 'none', separateAccount: true },
])(
  'só usa voz reserva antes de entregar áudio e não reutiliza cota da conta: $partial/$failure',
  async ({ partial, failure, separateAccount }) => {
    const config = ProvidersSchema.parse({
      ...DEFAULT_PROVIDERS,
      tts: {
        adapter: 'cartesia',
        model: 'sonic-3.6',
        voiceId: '43df381e-ea60-4277-bd90-91ceb0c71007',
        fallbackVoiceId: '0d7aa08b-81e4-4ad3-8f93-129cbb3585ce',
        ...(separateAccount
          ? { fallbackVoiceApiKeyEnv: 'CARTESIA_FALLBACK_API_KEY' }
          : {}),
        apiKeyEnv: 'CARTESIA_API_KEY',
        speechFallback: {
          adapter: 'http-json',
          endpoint: 'http://localhost:8002',
          apiKeyEnv: 'LOCAL_TTS_API_KEY',
          dataPolicy: 'local-approved',
        },
      },
    });
    const output = {
      content: '',
      inputTokens: null,
      outputTokens: null,
      audio: {
        pcmBase64: Buffer.alloc(4800).toString('base64'),
        sampleRate: 24000 as const,
        channels: 1 as const,
      },
    };
    const factory = vi.fn<ProviderFactory>((role, provider) => ({
      role,
      transport: 'buffered-json',
      nativeStreaming: false,
      health: async () => {
        throw new Error('unused');
      },
      execute: async () => output,
      ...(provider.adapter === 'cartesia' &&
      provider.voiceId === config.tts.voiceId
        ? {
            async *streamAudio() {
              if (failure === 'none') {
                yield output;

                return;
              }

              if (partial) {
                yield { ...output, progressiveAudio: true };
              }

              throw failure === 'quota'
                ? new QuotaExceededError()
                : new ProviderTemporarilyUnavailableError();
            },
          }
        : {}),
    }));
    const settle = vi.fn(async () => {});
    const gate = new ActivityGate(1);
    const service = createAudioStreaming(
      { get: async () => config, save: async () => {} },
      {
        reserve: async () => 'r',
        settle,
        usage: async () => {
          throw new Error('unused');
        },
      },
      'primary',
      factory,
      gate,
    );
    const chunks: ProviderOutput[] = [];

    const run = async () => {
      for await (const chunk of service.executeAudioStream({
        content: 'Texto.',
        dataClass: 'synthetic',
        maxTokens: 1,
      })) {
        chunks.push(chunk);
      }
    };

    if (partial) {
      await expect(run()).rejects.toMatchObject({
        code: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
      });
      expect(factory).toHaveBeenCalledTimes(1);
      expect(settle).toHaveBeenCalledWith('r', null);
    } else {
      await run();
      expect(factory).toHaveBeenCalledTimes(failure === 'none' ? 1 : 2);

      if (failure !== 'none') {
        expect(factory.mock.calls[1]![1]).toMatchObject(
          failure === 'quota' && !separateAccount
            ? { adapter: 'http-json' }
            : {
                adapter: 'cartesia',
                voiceId: config.tts.fallbackVoiceId,
                apiKeyEnv: separateAccount
                  ? 'CARTESIA_FALLBACK_API_KEY'
                  : 'CARTESIA_API_KEY',
              },
        );
      }
    }

    expect(chunks).toHaveLength(1);
    gate.beginConfiguration()();
  },
);
