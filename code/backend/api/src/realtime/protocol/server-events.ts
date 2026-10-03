import { z } from 'zod';
import { AudioSchema } from './audio.ts';

export const ServerEvent = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('session.ready'),
    sessionId: z.uuid(),
    protocolVersion: z.literal('1.0'),
    stage: z.literal('foundation'),
    voiceAvailable: z.literal(false),
    audio: AudioSchema,
  }),
  z.strictObject({ type: z.literal('pong'), id: z.string().min(1).max(64) }),
  z.strictObject({ type: z.literal('session.closed') }),
  z.strictObject({ type: z.literal('error'), code: z.string().max(64) }),
]);

export type ServerMessage = z.infer<typeof ServerEvent>;
