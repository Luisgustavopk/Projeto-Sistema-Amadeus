import { z } from 'zod';
import {
  ExpressionSchema,
  DeliveryPresetSchema,
} from '../../domain/persona/expression.ts';

const turnId = z.number().int().min(0).max(4294967295);
const responseId = z.uuid();
const segmentId = z.uuid();
const event = z.discriminatedUnion('type', [
  ExpressionSchema.extend({
    type: z.literal('reply.expression'),
    turnId,
    responseId,
    segmentId,
    position: z.number().int().nonnegative(),
    personaVersion: z.string().max(64),
    voiceProfileId: z.uuid().nullable(),
    metadataValid: z.boolean(),
    deliveryApplied: z.literal(false),
    deliveryPresetId: DeliveryPresetSchema,
    avatarExpression: z.enum([
      'sorriso_discreto',
      'olhar_atento',
      'expressao_neutra',
    ]),
  }),
  z.strictObject({
    type: z.literal('transcript.partial'),
    turnId,
    text: z.string().max(4000),
  }),
  z.strictObject({
    type: z.literal('state'),
    turnId,
    state: z.enum([
      'idle',
      'listening',
      'thinking',
      'speaking',
      'cancelling',
      'error',
    ]),
  }),
  z.strictObject({
    type: z.literal('transcript.final'),
    turnId,
    text: z.string().max(4000),
  }),
  z.strictObject({ type: z.literal('reply.start'), turnId, responseId }),
  z.strictObject({
    type: z.literal('reply.text'),
    turnId,
    responseId,
    segmentId,
    position: z.number().int().nonnegative(),
    text: z.string().max(220),
  }),
  z.strictObject({
    type: z.literal('audio.segment'),
    turnId,
    responseId,
    segmentId,
    sampleCount: z.number().int().positive(),
    frameCount: z.number().int().positive(),
    sampleRate: z.literal(16000),
  }),
  z.strictObject({ type: z.literal('reply.done'), turnId, responseId }),
  z.strictObject({ type: z.literal('interrupted'), turnId, responseId }),
  z.strictObject({
    type: z.literal('quota.warning'),
    turnId,
    role: z.enum(['llm', 'stt', 'tts']),
  }),
  z.strictObject({
    type: z.literal('error'),
    code: z.string().max(64),
    recoverable: z.boolean(),
    turnId: turnId.optional(),
  }),
]);
export const VoicePayload = event;
