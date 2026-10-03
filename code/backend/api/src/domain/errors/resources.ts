import { ApplicationError } from './application-error.ts';

export class NotFoundError extends ApplicationError {
  constructor(message = 'Recurso não encontrado.') {
    super('NOT_FOUND', message);
  }
}
