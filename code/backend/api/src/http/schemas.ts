import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('amadeus-api'),
});
export const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  requestId: z.string(),
});
export const CapabilitiesSchema = z.object({
  voice: z.boolean(),
  customVoice: z.boolean(),
  vision: z.boolean(),
  memory: z.boolean(),
  live2d: z.boolean(),
  desktop: z.boolean(),
  protocolVersion: z.literal('1.0'),
  foundationChannel: z.literal(true),
  providers: z.array(
    z.object({
      role: z.enum(['llm', 'stt', 'tts']),
      adapter: z.enum(['disabled', 'http-json']),
      model: z.string().nullable(),
      dataPolicy: z.enum(['synthetic-only', 'personal-approved']),
      available: z.boolean(),
      capabilities: z.object({
        incrementalGeneration: z.boolean(),
        progressiveDelivery: z.boolean(),
        vision: z.boolean(),
        customVoice: z.boolean(),
        testedVoiceControls: z.array(z.string()),
      }),
      capabilitySource: z.literal('adapter-reported'),
      transport: z.literal('buffered-json'),
      nativeStreaming: z.literal(false),
    }),
  ),
});
export type Health = z.infer<typeof HealthSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;
