import { z } from 'zod';

export const VoiceConfigSchema = z.object({
  CALL_TICKET_TTL_SECONDS: z.coerce.number().int().min(5).max(120).default(30),
  VOICE_REFERENCE_DIRECTORY: z
    .string()
    .default('../assets/voice-profiles/references'),
  MAX_CONNECTIONS: z.coerce.number().int().min(1).max(16).default(2),
});
