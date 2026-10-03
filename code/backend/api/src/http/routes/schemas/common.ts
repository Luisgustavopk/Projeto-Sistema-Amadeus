import { ErrorSchema } from '../../schemas.ts';

export const security = [{ bearerAuth: [] }];
export const errors = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  429: ErrorSchema,
  500: ErrorSchema,
  502: ErrorSchema,
  503: ErrorSchema,
};
