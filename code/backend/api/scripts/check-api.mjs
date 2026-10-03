const base = `${process.env.TLS_CERT_FILE ? 'https' : 'http'}://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.PORT ?? '3001'}`;
if (!process.env.API_ACCESS_TOKEN)
  throw new Error('Execute npm run setup antes de verificar a API.');
for (const path of [
  '/health',
  '/health/details',
  '/capabilities',
  '/usage',
  '/voice/protocol',
  '/openapi.json',
]) {
  const response = await fetch(`${base}/v1${path}`, {
    headers: { authorization: `Bearer ${process.env.API_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Verificação falhou em ${path}: HTTP ${response.status}`);
  await response.json();
  console.log(`${path}: OK`);
}
