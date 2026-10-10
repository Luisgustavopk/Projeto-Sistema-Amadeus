import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { VoiceProfile } from '../../domain/voice/model.ts';

// Persistent local cache; compiled and source modules resolve the same API/data.
const directory = new URL('../../../data/voice-presets/', import.meta.url);
let cached:
  | { text: string; voiceId: string; referenceSha256: string; pcm: Buffer }
  | null
  | undefined;

export function providerWaitAudio(
  text: string,
  profile: VoiceProfile,
  voiceId: string | null,
) {
  if (cached === undefined) {
    try {
      const manifest = JSON.parse(
        readFileSync(new URL('provider-wait.json', directory), 'utf8'),
      );
      const wav = readFileSync(new URL('provider-wait.wav', directory));

      if (
        wav.length <= 44 ||
        wav.length > 480044 ||
        wav.toString('ascii', 0, 4) !== 'RIFF' ||
        wav.toString('ascii', 8, 12) !== 'WAVE' ||
        wav.toString('ascii', 12, 16) !== 'fmt ' ||
        wav.readUInt32LE(16) !== 16 ||
        wav.readUInt16LE(20) !== 1 ||
        wav.readUInt16LE(22) !== 1 ||
        wav.readUInt32LE(24) !== 24000 ||
        wav.readUInt16LE(34) !== 16 ||
        wav.toString('ascii', 36, 40) !== 'data' ||
        wav.readUInt32LE(40) !== wav.length - 44 ||
        wav.length % 2 ||
        createHash('sha256').update(wav).digest('hex') !== manifest.sha256
      ) {
        throw new Error('Preset inválido.');
      }

      cached = {
        text: manifest.text,
        voiceId: manifest.voiceId,
        referenceSha256: manifest.referenceSha256,
        pcm: wav.subarray(44),
      };
    } catch {
      cached = null;
    }
  }

  return cached &&
    cached.text === text &&
    cached.voiceId === voiceId &&
    cached.referenceSha256 === profile.referenceSha256
    ? cached.pcm
    : null;
}
