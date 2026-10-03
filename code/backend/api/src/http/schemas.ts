import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('amadeus-api'),
});
export const ErrorSchema = z.object({ error: z.string() });
export const CapabilitiesSchema = z.object({
  voice: z.boolean(),
  customVoice: z.boolean(),
  vision: z.boolean(),
  memory: z.boolean(),
  live2d: z.boolean(),
  desktop: z.boolean(),
});
export type Health = z.infer<typeof HealthSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
