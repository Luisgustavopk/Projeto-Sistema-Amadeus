import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/index.ts';
import { openDatabase } from '../src/adapters/database/index.ts';
import { SqliteProviderConfigurationRepository } from '../src/adapters/database/provider-configuration-repository.ts';
import { SqliteProviderUsageRepository } from '../src/adapters/database/provider-usage-repository.ts';
import { createProviderFactory } from '../src/adapters/providers/factory.ts';
import { createProviderExecution } from '../src/application/providers/execution.ts';
import { ActivityGate } from '../src/application/runtime/activity-gate.ts';
import {
  describeDelivery,
  PERSONA_VERSION,
} from '../src/domain/persona/expression.ts';

const cases = [
  {
    intent: 'conversar',
    emotion: 'neutra',
    intensity: 0.15,
    text: 'A memória muda quando você a retoma. Não é uma gravação intacta; o contexto também entra nessa história.',
  },
  {
    intent: 'provocacao_afetuosa',
    emotion: 'ironia_leve',
    intensity: 0.25,
    text: 'Funcionou na sua máquina. Ótimo, já temos uma amostra. Agora falta a parte inconveniente: testar de novo.',
  },
  {
    intent: 'agradecer',
    emotion: 'constrangimento_leve',
    intensity: 0.2,
    text: 'Obrigada. Eu tinha receio de ter complicado a explicação, mas parece que o exemplo ajudou.',
  },
  {
    intent: 'acolher',
    emotion: 'preocupacao',
    intensity: 0.3,
    text: 'Esse dia parece ter sido pesado. Podemos deixar as soluções para depois e conversar sobre o que aconteceu.',
  },
];

async function main() {
  const config = loadConfig();
  const database = await openDatabase(config.DATABASE_URL);

  try {
    const repository = new SqliteProviderConfigurationRepository(
      database.client,
    );
    const stored = await repository.get(config.OWNER_ID);
    const execution = createProviderExecution(
      repository,
      new SqliteProviderUsageRepository(database.client),
      config.OWNER_ID,
      createProviderFactory(process.env),
      new ActivityGate(1),
    );
    const directory = new URL(
      `../data/skill-voice/${Date.now()}/`,
      import.meta.url,
    );
    await mkdir(directory, { recursive: true });
    const report = {
      personaVersion: PERSONA_VERSION,
      adapter: stored.tts.adapter,
      model: stored.tts.model,
      voiceId: stored.tts.voiceId,
      nativeControlsApplied: false,
      humanReview: 'pending',
      samples: [],
    };

    for (const item of cases) {
      const preset = describeDelivery(item).deliveryPresetId;
      const result = await execution.execute(
        'tts',
        { content: item.text, dataClass: 'synthetic', maxTokens: 1 },
        AbortSignal.timeout(90000),
      );
      const audio = result.audio;
      if (
        !audio ||
        ![16000, 24000].includes(audio.sampleRate) ||
        audio.channels !== 1
      )
        throw new Error('Áudio TTS inválido.');
      const pcm = Buffer.from(audio.pcmBase64, 'base64');
      if (!pcm.length || pcm.length % 2)
        throw new Error('PCM vazio ou incompleto.');
      const header = Buffer.alloc(44);
      header.write('RIFF');
      header.writeUInt32LE(36 + pcm.length, 4);
      header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(audio.sampleRate, 24);
      header.writeUInt32LE(audio.sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(pcm.length, 40);
      const file = new URL(`${preset}.wav`, directory);
      await writeFile(file, Buffer.concat([header, pcm]));
      report.samples.push({
        ...item,
        preset,
        sampleRate: audio.sampleRate,
        durationSeconds: pcm.length / (audio.sampleRate * 2),
        file: fileURLToPath(file),
        review: null,
      });
      await writeFile(
        new URL('review.json', directory),
        JSON.stringify(report, null, 2) + '\n',
      );
    }

    console.log(
      `Amostras: ${fileURLToPath(directory)}. Escuta humana pendente; sem controles emocionais nativos aplicados.`,
    );
  } finally {
    database.client.close();
  }
}

main().catch((error) => {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
});
