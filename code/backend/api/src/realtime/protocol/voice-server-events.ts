import { z } from 'zod';
import {
  ExpressionSchema,
  DeliveryPresetSchema,
} from '../../domain/persona/expression.ts';

const turnId = z.number().int().min(0).max(4294967295);
const responseId = z.uuid();
const segmentId = z.uuid();
const event = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('presence.cancelled'),
    offerId: z.uuid(),
    turnId,
  }),
  z.strictObject({
    type: z.literal('presence.offer'),
    offerId: z.uuid(),
    kind: z.enum(['greeting', 'initiative']),
  }),
  z.strictObject({
    type: z.literal('audio.abort'),
    turnId,
    responseId,
    segmentId,
  }),
  z.strictObject({
    type: z.literal('audio.start'),
    turnId,
    responseId,
    segmentId,
    sampleRate: z.union([z.literal(16000), z.literal(24000)]),
  }),
  z.strictObject({
    type: z.literal('audio.end'),
    turnId,
    responseId,
    segmentId,
    sampleCount: z.number().int().positive().max(2160000),
    frameCount: z.number().int().positive().max(4500),
  }),
  ExpressionSchema.extend({
    type: z.literal('reply.expression'),
    turnId,
    responseId,
    segmentId,
    position: z.number().int().nonnegative(),
    personaVersion: z.string().max(64),
    voiceProfileId: z.uuid().nullable(),
    metadataValid: z.boolean(),
    phase: z.enum(['initial', 'update']).optional(),
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
    type: z.literal('reply.wait'),
    turnId,
    responseId,
    reason: z.literal('provider-fallback'),
    text: z.string().max(120),
  }),
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
    sampleRate: z.union([z.literal(16000), z.literal(24000)]),
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
