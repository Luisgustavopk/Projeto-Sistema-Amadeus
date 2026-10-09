import { z } from 'zod';
import {
  DataClassSchema,
  RoleSchema,
  type Role,
} from '../../domain/providers/model.ts';
import { InvalidProviderInputError } from '../../domain/errors/providers.ts';
import type { ProviderInput } from '../../ports/provider.ts';

const InputSchema = z.strictObject({
  content: z.string().max(65536),
  systemPrompt: z.string().min(1).max(32768).optional(),
  dataClass: DataClassSchema,
  purpose: z.enum(['conversation', 'memory', 'expression']).optional(),
  memoryTask: z
    .enum(['extract', 'review', 'reconcile', 'answer', 'verify-answer'])
    .optional(),
  audio: z
    .strictObject({
      pcmBase64: z.string().max(1280000),
      sampleRate: z.literal(16000),
      channels: z.literal(1),
    })
    .optional(),
  voice: z
    .strictObject({
      id: z.uuid(),
      referenceFile: z.string().max(128),
      referenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .optional(),
  maxTokens: z.number().int().min(1).max(1000000),
  speechContextId: z.uuid().optional(),
  sessionId: z.uuid().optional(),
  history: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8192),
      }),
    )
    .max(24)
    .optional(),
});

export function validateProviderInput(role: Role, input: ProviderInput) {
  if (
    !InputSchema.safeParse(input).success ||
    !RoleSchema.safeParse(role).success ||
    (role !== 'llm' && input.systemPrompt !== undefined) ||
    (role !== 'llm' && input.purpose !== undefined) ||
    (role !== 'llm' &&
      (input.history !== undefined || input.sessionId !== undefined)) ||
    (input.history?.reduce(
      (size, message) => size + message.content.length,
      0,
    ) ?? 0) > 65536 ||
    (role !== 'tts' && input.speechContextId !== undefined) ||
    (input.memoryTask !== undefined && input.purpose !== 'memory') ||
    (role === 'stt' ? !input.audio : !input.content.trim())
  ) {
    throw new InvalidProviderInputError();
  }
}

export function estimateProviderBudget(input: ProviderInput) {
  return (
    Buffer.byteLength(input.content, 'utf8') +
    Buffer.byteLength(input.systemPrompt ?? '', 'utf8') +
    (input.history?.reduce(
      (size, message) => size + Buffer.byteLength(message.content, 'utf8'),
      0,
    ) ?? 0) +
    Math.ceil((input.audio?.pcmBase64.length ?? 0) / 4) +
    input.maxTokens
  );
}
