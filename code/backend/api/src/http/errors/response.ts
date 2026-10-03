import {
  ApplicationError,
  type ErrorCode,
} from '../../domain/errors/application-error.ts';

const HTTP_STATUS: Record<ErrorCode, number> = {
  QUOTA_EXCEEDED: 429,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_TEMPORARILY_UNAVAILABLE: 503,
  PROVIDER_INVALID: 502,
  PROVIDER_CONFIGURATION: 400,
  PROVIDER_DISABLED: 503,
  ORIGIN_DENIED: 403,
  NOT_FOUND: 404,
  UPGRADE_REQUIRED: 426,
  UNAUTHORIZED: 401,
  CONNECTION_LIMIT: 429,
  PROVIDER_BUSY: 409,
  INVALID_PROVIDER_INPUT: 400,
  DATA_POLICY_BLOCKED: 403,
  DATABASE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  VOICE_INPUT_INVALID: 400,
  NO_SPEECH_DETECTED: 422,
  VOICE_NOT_READY: 409,
};

export function describeHttpError(error: unknown) {
  if (error instanceof ApplicationError) {
    return {
      status: HTTP_STATUS[error.code],
      code: error.code,
      message: error.message,
    };
  }

  const statusCode =
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return {
      status: statusCode,
      code: 'INVALID_REQUEST',
      message: 'Requisição inválida.',
    };
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Falha interna ao processar a requisição.',
  };
}
