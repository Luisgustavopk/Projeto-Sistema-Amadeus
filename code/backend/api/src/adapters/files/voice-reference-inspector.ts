import { realpath, readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { VoiceReferenceInspector } from '../../ports/voice-profile-repository.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';

export function createVoiceReferenceInspector(
  directory: string,
): VoiceReferenceInspector {
  return {
    async inspect(referenceFile) {
      try {
        const base = await realpath(resolve(directory));
        const file = await realpath(resolve(base, referenceFile));
        const rel = relative(base, file);

        if (
          rel.startsWith('..') ||
          isAbsolute(rel) ||
          !referenceFile.match(/^[a-zA-Z0-9_.-]+\.wav$/i)
        ) {
          throw new VoiceInputError();
        }

        const info = await stat(file);

        if (!info.isFile() || info.size > 10 * 1024 * 1024) {
          throw new VoiceInputError();
        }

        const wav = await readFile(file);

        if (
          wav.length < 44 ||
          wav.toString('ascii', 0, 4) !== 'RIFF' ||
          wav.toString('ascii', 8, 12) !== 'WAVE'
        ) {
          throw new VoiceInputError(
            'A referência deve ser um arquivo WAV PCM.',
          );
        }

        let offset = 12,
          byteRate = 0,
          pcm = false,
          dataBytes = 0,
          blockAlign = 0;

        while (offset + 8 <= wav.length) {
          const size = wav.readUInt32LE(offset + 4);

          if (offset + 8 + size > wav.length) {
            throw new VoiceInputError();
          }

          const tag = wav.toString('ascii', offset, offset + 4);

          if (tag === 'fmt ' && size >= 16) {
            const channels = wav.readUInt16LE(offset + 10);
            const sampleRate = wav.readUInt32LE(offset + 12);
            const bits = wav.readUInt16LE(offset + 22);
            blockAlign = wav.readUInt16LE(offset + 20);
            byteRate = wav.readUInt32LE(offset + 16);
            pcm =
              wav.readUInt16LE(offset + 8) === 1 &&
              channels >= 1 &&
              channels <= 2 &&
              sampleRate >= 16000 &&
              sampleRate <= 96000 &&
              bits === 16 &&
              blockAlign === channels * 2 &&
              byteRate === sampleRate * blockAlign;
          }

          if (tag === 'data') {
            dataBytes += size;
          }

          offset += 8 + size + (size % 2);
        }

        const durationSeconds = dataBytes / byteRate;

        if (
          !pcm ||
          !dataBytes ||
          dataBytes % blockAlign ||
          !Number.isFinite(durationSeconds) ||
          durationSeconds < 3 ||
          durationSeconds > 30
        ) {
          throw new VoiceInputError(
            'Use uma referência WAV PCM de 3 a 30 segundos.',
          );
        }

        return {
          sha256: createHash('sha256').update(wav).digest('hex'),
          durationSeconds,
        };
      } catch (error) {
        if (error instanceof VoiceInputError) {
          throw error;
        }

        throw new VoiceInputError(
          'Não foi possível ler a referência no diretório configurado.',
        );
      }
    },
  };
}
