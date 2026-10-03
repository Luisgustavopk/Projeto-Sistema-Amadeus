import { z } from 'zod';
import { security, errors } from './common.ts';
import {
  HealthSchema,
  CapabilitiesSchema,
  ErrorSchema,
} from '../../schemas.ts';

export const health = { schema: { response: { 200: HealthSchema } } };

export const healthDetails = {
  schema: {
    security,
    response: {
      200: z.object({
        api: z.literal('ok'),
        database: z.enum(['ok', 'unavailable']),
        providers: z.array(
          z.object({ role: z.string(), available: z.boolean() }),
        ),
      }),
      ...errors,
    },
  },
};

export const metrics = {
  schema: {
    security,
    response: {
      200: z.object({
        requests: z.number(),
        errors: z.number(),
        totalDurationMs: z.number(),
        activeConnections: z.number(),
        uptimeSeconds: z.number(),
        residentMemoryBytes: z.number(),
        voice: z.unknown(),
      }),
      ...errors,
    },
  },
};

export const voiceProtocol = {
  schema: { security, response: { 200: z.unknown(), ...errors } },
};

export const capabilities = {
  schema: {
    security: [{ bearerAuth: [] }],
    response: { 200: CapabilitiesSchema, 401: ErrorSchema },
  },
};

export const openapi = { schema: { hide: true } };
