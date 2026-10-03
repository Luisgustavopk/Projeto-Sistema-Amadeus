import { ApplicationError } from './application-error.ts';

export class RateLimitedError extends ApplicationError {
  constructor(message = 'Limite temporário de requisições.') {
    super('RATE_LIMITED', message);
  }
}
