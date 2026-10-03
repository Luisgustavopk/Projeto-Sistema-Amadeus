import { z } from 'zod';
import { security, errors } from './common.ts';

const params = z.strictObject({ id: z.uuid() });
const originSchema = z.string().url().max(256);

export const createConversation = {
  schema: {
    security,
    body: z.strictObject({}),
    response: {
      201: z.object({ id: z.uuid(), createdAt: z.iso.datetime() }),
      ...errors,
    },
  },
};

export const issueTicket = {
  schema: {
    security,
    params,
    body: z.strictObject({ origin: originSchema }),
    response: {
      201: z.object({
        ticket: z.string(),
        expiresAt: z.iso.datetime(),
        protocolVersion: z.literal('1.0'),
      }),
      ...errors,
    },
  },
};
