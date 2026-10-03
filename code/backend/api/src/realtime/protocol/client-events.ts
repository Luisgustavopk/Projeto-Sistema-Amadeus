import { z } from 'zod';
import { AudioSchema } from './audio.ts';

export const ClientEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('session.start'),
    protocolVersion: z.enum(['1.0', '1.1']),
    dataClass: z.enum(['synthetic', 'personal', 'local-only']).optional(),
    audio: AudioSchema,
  }),
  z.strictObject({ type: z.literal('ping'), id: z.string().min(1).max(64) }),
  z.strictObject({ type: z.literal('session.end') }),
  z.strictObject({
    type: z.literal('speech.start'),
    turnId: z.number().int().min(1).max(4294967295),
  }),
  z.strictObject({
    type: z.literal('speech.end'),
    turnId: z.number().int().min(1).max(4294967295),
  }),
  z.strictObject({
    type: z.literal('text.send'),
    turnId: z.number().int().min(1).max(4294967295),
    text: z.string().trim().min(1).max(4000),
  }),
  z.strictObject({ type: z.literal('interrupt') }),
  z.strictObject({
    type: z.literal('playback.progress'),
    responseId: z.uuid(),
    segmentId: z.uuid(),
    playedSamples: z.number().int().nonnegative().max(1572864),
  }),
  z.strictObject({ type: z.literal('playback.ended'), responseId: z.uuid() }),
]);

export type ClientMessage = z.infer<typeof ClientEvent>;
