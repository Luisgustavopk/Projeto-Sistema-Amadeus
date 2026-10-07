import { createClient } from '@libsql/client';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { SqliteVoiceProfileRepository } from '../src/adapters/database/voice-profile-repository.ts';
import { createProviderServices } from '../src/application/providers/index.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { providerWaitPhrase } from '../src/application/voice/provider-wait.ts';

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./data/amadeus.db',
});
try {
  await client.execute('PRAGMA busy_timeout = 3000');
  const ownerId = process.env.OWNER_ID ?? 'primary';
  const configuration = new SqliteProviderConfigurationRepository(client);
  const config = (await configuration.get(ownerId)).tts;
  const profile = await new SqliteVoiceProfileRepository(client).active(
    ownerId,
  );
  const text = providerWaitPhrase();
  if (!profile || !text || config.adapter !== 'cartesia' || !config.voiceId)
    throw new Error(
      'Ative o preset e uma voz Cartesia antes de preparar o áudio.',
    );
  const gate = {
    beginConfiguration: () => () => {},
    beginExecution: () => () => {},
  };
  const providers = createProviderServices({
    configuration,
    usage: new SqliteProviderUsageRepository(client),
    ownerId,
    factory: createProviderFactory(process.env),
    gate,
  });
  const result = await providers.execute('tts', {
    content: text,
    dataClass: 'personal',
    maxTokens: 1,
    voice: {
      id: profile.id,
      referenceFile: profile.referenceFile,
      referenceSha256: profile.referenceSha256,
    },
  });
  if (
    !result.audio ||
    result.audio.sampleRate !== 24000 ||
    result.audio.channels !== 1
  )
    throw new Error('O preset exige a voz Cartesia em 24 kHz.');
  const pcm = Buffer.from(result.audio.pcmBase64, 'base64');
  if (!pcm.length || pcm.length > 480000 || pcm.length % 2)
    throw new Error('Áudio inválido ou acima de dez segundos.');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  const directory = new URL('../data/voice-presets/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('provider-wait.wav.tmp', directory), wav);
  await writeFile(
    new URL('provider-wait.json.tmp', directory),
    JSON.stringify(
      {
        text,
        voiceId: config.voiceId,
        referenceSha256: profile.referenceSha256,
        sha256: createHash('sha256').update(wav).digest('hex'),
      },
      null,
      2,
    ) + '\n',
  );
  await rename(
    new URL('provider-wait.wav.tmp', directory),
    new URL('provider-wait.wav', directory),
  );
  await rename(
    new URL('provider-wait.json.tmp', directory),
    new URL('provider-wait.json', directory),
  );
  console.log(
    JSON.stringify({
      prepared: true,
      file: 'data/voice-presets/provider-wait.wav',
      seconds: pcm.length / 48000,
    }),
  );
} finally {
  client.close();
}
