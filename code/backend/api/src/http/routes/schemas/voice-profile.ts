import { z } from 'zod';
import { security, errors } from './common.ts';

const profile = z.object({
  id: z.uuid(),
  name: z.string(),
  referenceFile: z.string(),
  referenceSha256: z.string(),
  createdAt: z.iso.datetime(),
});
export const get = {
  schema: {
    security,
    response: { 200: z.object({ profile: profile.nullable() }), ...errors },
  },
};
export const activate = {
  schema: {
    security,
    body: z.strictObject({
      name: z.string().trim().min(1).max(80),
      referenceFile: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]+\.wav$/i)
        .max(128),
      consentConfirmed: z.literal(true),
    }),
    response: { 200: z.object({ profile }), ...errors },
  },
};
