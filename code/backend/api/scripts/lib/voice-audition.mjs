import { Buffer } from 'node:buffer';
import { createProvider } from '../../src/adapters/providers/http-json.ts';
import { ProviderSchema } from '../../src/domain/providers/model.ts';

export async function loadVoiceAudition() {
  if (!process.env.API_ACCESS_TOKEN) {
    throw new Error('Configure API_ACCESS_TOKEN no .env da API.');
  }

  const base = `${process.env.TLS_CERT_FILE ? 'https' : 'http'}://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3001'}`;
  async function readApi(path) {
    const response = await fetch(`${base}/v1${path}`, {
      headers: { authorization: `Bearer ${process.env.API_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Consulta ${path}: HTTP ${response.status}.`);
    }
    return response.json();
  }

  const [{ profile }, configuration, metrics] = await Promise.all([
    readApi('/voice/profile'),
    readApi('/providers'),
    readApi('/metrics'),
  ]);

  if (metrics.activeConnections > 0) {
    throw new Error(
      'Encerre a chamada antes de executar a avaliação isolada de voz.',
    );
  }
  if (!profile) {
    throw new Error(
      'Ative uma referência em PUT /v1/voice/profile antes do teste.',
    );
  }
  const config = ProviderSchema.parse(configuration.tts);
  const endpoint = config.endpoint ? new URL(config.endpoint) : null;
  if (
    config.adapter !== 'http-json' ||
    !endpoint ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
  ) {
    throw new Error('Este teste exige um serviço TTS HTTP local configurado.');
  }

  const provider = createProvider('tts', config, process.env);
  return {
    profile,
    async synthesize(text) {
      const result = await provider.execute(
        {
          content: text,
          dataClass: 'synthetic',
          maxTokens: 1,
          voice: {
            id: profile.id,
            referenceFile: profile.referenceFile,
            referenceSha256: profile.referenceSha256,
          },
        },
        AbortSignal.timeout(120000),
      );
      const audio = result.audio;
      if (
        !audio ||
        audio.sampleRate !== 16000 ||
        audio.channels !== 1 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          audio.pcmBase64,
        )
      ) {
        throw new Error('O TTS não retornou áudio PCM válido.');
      }
      const pcm = Buffer.from(audio.pcmBase64, 'base64');
      if (!pcm.length || pcm.length % 2 || pcm.length > 16000 * 2 * 90) {
        throw new Error('O áudio retornado está vazio ou excede os limites.');
      }
      const wav = Buffer.alloc(44);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(36 + pcm.length, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(16000, 24);
      wav.writeUInt32LE(32000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(pcm.length, 40);
      let peak = 0;
      let clippedSamples = 0;
      for (let index = 0; index < pcm.length; index += 2) {
        const sample = Math.abs(pcm.readInt16LE(index));
        peak = Math.max(peak, sample);
        if (sample >= 32767) clippedSamples++;
      }
      return {
        wav: Buffer.concat([wav, pcm]),
        durationSeconds: pcm.length / 32000,
        peak,
        clippedSamples,
      };
    },
  };
}
