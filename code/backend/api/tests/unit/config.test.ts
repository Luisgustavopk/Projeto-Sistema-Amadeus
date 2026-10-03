import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.ts';

const token = 'test-only-credential-of-more-than-32-characters';
describe('transporte e configuração', () => {
  it('reporta uma origem malformada como erro de configuração', () => {
    expect(() =>
      loadConfig({ API_ACCESS_TOKEN: token, ALLOWED_ORIGINS: 'not-a-url' }),
    ).toThrow('Configuração inválida');
  });

  it('permite HTTP somente em loopback', () => {
    for (const HOST of ['127.0.0.1', 'localhost', '::1']) {
      expect(loadConfig({ API_ACCESS_TOKEN: token, HOST }).HOST).toBe(HOST);
    }

    for (const HOST of ['0.0.0.0', '192.168.1.2', '::']) {
      expect(() => loadConfig({ API_ACCESS_TOKEN: token, HOST })).toThrow(
        'HTTPS',
      );
    }
  });
  it('exige par TLS e origens HTTPS quando TLS está ativo', () => {
    expect(() =>
      loadConfig({ API_ACCESS_TOKEN: token, TLS_CERT_FILE: 'cert' }),
    ).toThrow('TLS');
    expect(() =>
      loadConfig({
        API_ACCESS_TOKEN: token,
        TLS_CERT_FILE: 'cert',
        TLS_KEY_FILE: 'key',
        ALLOWED_ORIGINS: 'http://localhost:5173',
      }),
    ).toThrow('HTTPS');
    expect(
      loadConfig({
        API_ACCESS_TOKEN: token,
        HOST: '0.0.0.0',
        TLS_CERT_FILE: 'cert',
        TLS_KEY_FILE: 'key',
        ALLOWED_ORIGINS: 'https://amadeus.example',
      }).ALLOWED_ORIGINS,
    ).toEqual(['https://amadeus.example']);
  });
  it('rejeita origens com caminho e não reflete o token em erros', () => {
    expect(() =>
      loadConfig({
        API_ACCESS_TOKEN: token,
        ALLOWED_ORIGINS: 'https://example.com/path',
      }),
    ).toThrow();

    try {
      loadConfig({ API_ACCESS_TOKEN: 'sensitive-short-value' });
    } catch (error) {
      expect(String(error)).not.toContain('sensitive-short-value');
    }
  });
});
