import { ApplicationError } from './application-error.ts';

export class OriginDeniedError extends ApplicationError {
  constructor(message = 'Origem do cliente não autorizada.') {
    super('ORIGIN_DENIED', message);
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = 'Acesso não autorizado.') {
    super('UNAUTHORIZED', message);
  }
}
