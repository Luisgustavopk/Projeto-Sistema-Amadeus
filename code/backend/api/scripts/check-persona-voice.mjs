import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadVoiceAudition } from './lib/voice-audition.mjs';
import { PERSONA_VERSION } from '../src/domain/persona/expression.ts';

async function main() {
  const audition = await loadVoiceAudition();
  const cases = [
    {
      id: '01-explicativa',
      text: 'A atenção ajuda a registrar uma experiência. Por isso, dividir o foco pode dificultar lembrar um nome.',
      direction: 'neutro_claro_v1',
    },
    {
      id: '02-ironia-discreta',
      text: 'Tá, você tinha razão dessa vez. A hipótese precisava de mais uma medição.',
      direction: 'seco_suave_v1',
    },
    {
      id: '03-acolhedora',
      text: 'Parece que hoje foi um dia difícil. Quer me contar o que aconteceu, ou prefere conversar sobre outra coisa?',
      direction: 'acolhedor_calmo_v1',
    },
  ];
  const directory = new URL(
    `../data/persona-voice/${Date.now()}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const report = {
    personaVersion: PERSONA_VERSION,
    voiceProfileId: audition.profile.id,
    referenceSha256: audition.profile.referenceSha256,
    nativeVoiceControlsApplied: [],
    humanReview: 'pending',
    samples: [],
  };
  for (const item of cases) {
    const started = performance.now();
    const { wav, ...quality } = await audition.synthesize(item.text);
    const file = new URL(`${item.id}.wav`, directory);
    await writeFile(file, wav);
    report.samples.push({
      ...item,
      ...quality,
      synthesisMs: performance.now() - started,
      file: fileURLToPath(file),
    });
    await writeFile(
      new URL('review.json', directory),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(`Áudio: ${fileURLToPath(file)}`);
  }
  console.log(
    'Mesma referência, sem controles emocionais nativos. Ouça pt-BR, identidade entre frases, naturalidade e omissões; revisão pendente.',
  );
}

main().catch((error) => {
  console.error(error.code ?? error.message ?? 'Falha no teste de voz.');
  process.exitCode = 1;
});
