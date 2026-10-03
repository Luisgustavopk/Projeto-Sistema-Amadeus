import { ApplicationError } from './application-error.ts';

export class UpgradeRequiredError extends ApplicationError {
  constructor(message = 'Esta rota exige WebSocket.') {
    super('UPGRADE_REQUIRED', message);
  }
}

export class ConnectionLimitError extends ApplicationError {
  constructor(message = 'Limite de conexões atingido.') {
    super('CONNECTION_LIMIT', message);
  }
}
