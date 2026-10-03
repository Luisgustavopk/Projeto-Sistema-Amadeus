import { z } from 'zod';

export const AUDIO_FORMAT = {
  codec: 'pcm_s16le',
  sampleRate: 16000,
  channels: 1,
  frameDurationMs: 20,
} as const;

export const AudioSchema = z.strictObject({
  codec: z.literal(AUDIO_FORMAT.codec),
  sampleRate: z.literal(AUDIO_FORMAT.sampleRate),
  channels: z.literal(AUDIO_FORMAT.channels),
  frameDurationMs: z.literal(AUDIO_FORMAT.frameDurationMs),
});
