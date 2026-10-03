import { ApplicationError } from './application-error.ts';

export class DatabaseUnavailableError extends ApplicationError {
  constructor(message = 'O banco de dados está indisponível.') {
    super('DATABASE_UNAVAILABLE', message);
  }
}
