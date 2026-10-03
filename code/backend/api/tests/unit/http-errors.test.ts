import { expect, it } from 'vitest';
import {
  ProviderBusyError,
  ProviderInvalidError,
} from '../../src/domain/errors/providers.ts';
import { describeHttpError } from '../../src/http/errors/response.ts';

it('traduz exceções de aplicação mantendo código e mensagem pública', () => {
  expect(describeHttpError(new ProviderBusyError())).toMatchObject({
    status: 409,
    code: 'PROVIDER_BUSY',
  });
  expect(
    describeHttpError(
      new ProviderInvalidError('Resposta inválida do adaptador.'),
    ),
  ).toEqual({
    status: 502,
    code: 'PROVIDER_INVALID',
    message: 'Resposta inválida do adaptador.',
  });
});

it('oculta detalhes de erros inesperados e de validação', () => {
  const error = new Error('secret-token SQL database-path');
  expect(describeHttpError(error)).toEqual({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Falha interna ao processar a requisição.',
  });
  expect(describeHttpError(Object.assign(error, { statusCode: 400 }))).toEqual({
    status: 400,
    code: 'INVALID_REQUEST',
    message: 'Requisição inválida.',
  });
  expect(describeHttpError({ statusCode: 200 })).toMatchObject({ status: 500 });
});
