import { z } from 'zod';

export const TransportConfigSchema = z.object({
  TLS_CERT_FILE: z.string().optional(),
  TLS_KEY_FILE: z.string().optional(),
});

type TransportConfig = z.infer<typeof TransportConfigSchema> & {
  HOST: string;
  ALLOWED_ORIGINS: string[];
};

export function validateTransport(
  config: TransportConfig,
  context: z.RefinementCtx,
) {
  const hasCertificate = Boolean(config.TLS_CERT_FILE);
  const hasKey = Boolean(config.TLS_KEY_FILE);
  const tlsEnabled = hasCertificate && hasKey;
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(config.HOST);

  if (hasCertificate !== hasKey) {
    context.addIssue({
      code: 'custom',
      message: 'TLS exige certificado e chave.',
    });
  }

  if (!loopback && !tlsEnabled) {
    context.addIssue({
      code: 'custom',
      message:
        'HTTPS é obrigatório fora de localhost. Configure TLS_CERT_FILE e TLS_KEY_FILE.',
    });
  }

  if (
    tlsEnabled &&
    config.ALLOWED_ORIGINS.some(
      (origin) => new URL(origin).protocol !== 'https:',
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: 'O modo TLS aceita somente origens HTTPS.',
    });
  }
}
