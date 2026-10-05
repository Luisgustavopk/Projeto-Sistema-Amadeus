import type { AudioClip } from '../../domain/voice/model.ts';

/** Acoustic measurements, deliberately not emotion or intent classification. */
export function measureVoiceAudio(audio: AudioClip, transcript: string) {
  const pcm = Buffer.from(audio.pcmBase64, 'base64');

  if (
    !pcm.length ||
    pcm.length % 2 ||
    audio.sampleRate !== 16000 ||
    audio.channels !== 1
  ) {
    return undefined;
  }

  let squared = 0;
  let peak = 0;
  let quietFrames = 0;
  let frames = 0;

  for (let offset = 0; offset < pcm.length; offset += 640) {
    const end = Math.min(pcm.length, offset + 640);
    let frameEnergy = 0;

    for (let index = offset; index < end; index += 2) {
      const sample = pcm.readInt16LE(index) / 32768;
      frameEnergy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    squared += frameEnergy;
    quietFrames += Math.sqrt(frameEnergy / ((end - offset) / 2)) < 0.01 ? 1 : 0;
    frames++;
  }

  const duration = pcm.length / 32000;
  const words = transcript.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const round = (value: number) => Math.round(value * 1000) / 1000;

  return {
    source: 'captured PCM; no emotion classifier',
    durationSeconds: round(duration),
    rms: round(Math.sqrt(squared / (pcm.length / 2))),
    peak: round(peak),
    lowEnergyFrameFraction: round(quietFrames / frames),
    estimatedWordsPerSecondIncludingPauses: round(words / duration),
    interpretation:
      'Microphone, noise and gain affect these values. Do not infer sadness, anger, urgency or intent from them.',
  };
}
