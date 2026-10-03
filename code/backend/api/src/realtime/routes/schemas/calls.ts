import { z } from 'zod';

export const CallRouteSchema = {
  params: z.strictObject({ id: z.uuid() }),
  querystring: z.strictObject({
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }),
  hide: true,
};
