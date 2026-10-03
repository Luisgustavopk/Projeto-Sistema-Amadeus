import { ApplicationError } from './application-error.ts';

export class QuotaExceededError extends ApplicationError {
  constructor(
    message = 'O orçamento configurado para o adaptador foi esgotado.',
  ) {
    super('QUOTA_EXCEEDED', message);
  }
}

export class ProviderUnavailableError extends ApplicationError {
  constructor(message = 'Não foi possível executar o adaptador.') {
    super('PROVIDER_UNAVAILABLE', message);
  }
}

export class ProviderInvalidError extends ApplicationError {
  constructor(message = 'Resposta inválida do adaptador.') {
    super('PROVIDER_INVALID', message);
  }
}

export class ProviderConfigurationError extends ApplicationError {
  constructor(
    message = 'A variável de segredo do adaptador não foi configurada.',
  ) {
    super('PROVIDER_CONFIGURATION', message);
  }
}

export class ProviderDisabledError extends ApplicationError {
  constructor(message = 'O adaptador está desabilitado.') {
    super('PROVIDER_DISABLED', message);
  }
}

export class ProviderBusyError extends ApplicationError {
  constructor(message = 'O adaptador está ocupado.') {
    super('PROVIDER_BUSY', message);
  }
}

export class InvalidProviderInputError extends ApplicationError {
  constructor(message = 'Entrada inválida para o adaptador.') {
    super('INVALID_PROVIDER_INPUT', message);
  }
}

export class DataPolicyBlockedError extends ApplicationError {
  constructor(
    message = 'A política impede o envio deste conteúdo ao adaptador.',
  ) {
    super('DATA_POLICY_BLOCKED', message);
  }
}
