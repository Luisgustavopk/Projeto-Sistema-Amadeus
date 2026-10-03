import { z } from 'zod';
import { AudioSchema } from './audio.ts';

export const ClientEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('session.start'),
    protocolVersion: z.literal('1.0'),
    audio: AudioSchema,
  }),
  z.strictObject({ type: z.literal('ping'), id: z.string().min(1).max(64) }),
  z.strictObject({ type: z.literal('session.end') }),
]);

export type ClientMessage = z.infer<typeof ClientEvent>;
