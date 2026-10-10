import { z } from 'zod';
import { security, errors } from './common.ts';
import { ProvidersSchema } from '../../../domain/providers/model.ts';

const usageSchema = z.object({
  role: z.enum(['llm', 'stt', 'tts']),
  model: z.string().nullable().optional(),
  isFallback: z.boolean().optional(),
  isLocal: z.boolean().optional(),
  day: z.string(),
  requests: z.number(),
  budgetTokens: z.number(),
  reportedInputTokens: z.number(),
  reportedOutputTokens: z.number(),
  estimatedRequests: z.number(),
  limits: z.object({
    enforced: z.boolean().optional(),
    requestsPerDay: z.number(),
    tokensPerDay: z.number(),
    source: z.enum(['operator', 'provider']),
  }),
});

export const usage = {
  schema: {
    security,
    response: {
      200: z.object({
        period: z.literal('UTC-day'),
        automaticPaidFallback: z.literal(false),
        providers: z.array(usageSchema),
      }),
      ...errors,
    },
  },
};

export const getProviders = {
  schema: { security, response: { 200: ProvidersSchema, ...errors } },
};

export const configureProviders = {
  schema: {
    security,
    body: ProvidersSchema,
    response: { 200: ProvidersSchema, ...errors },
  },
};

export const providerProtocol = {
  schema: { security, response: { 200: z.unknown(), ...errors } },
};
