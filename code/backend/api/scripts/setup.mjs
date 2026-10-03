import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const root = new URL('../', import.meta.url);
await mkdir(new URL('data/', root), { recursive: true });
const example = await readFile(new URL('.env.example', root), 'utf8');
try {
  await writeFile(
    new URL('.env', root),
    example.replace(
      'API_ACCESS_TOKEN=',
      `API_ACCESS_TOKEN=${randomBytes(32).toString('hex')}`,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Configuração local criada. O token está no arquivo .env.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;

  const envFile = new URL('.env', root);
  const existing = await readFile(envFile, 'utf8');
  const token = parseEnv(existing).API_ACCESS_TOKEN;

  if (token && token.length >= 32) {
    console.log('Configuração local existente preservada.');
  } else {
    const entry = `API_ACCESS_TOKEN=${randomBytes(32).toString('hex')}`;
    const tokenLine =
      /^[\t ]*(?:export[\t ]+)?API_ACCESS_TOKEN[\t ]*=[^\r\n]*/gm;
    const newline = existing.includes('\r\n') ? '\r\n' : '\n';
    const updated = tokenLine.test(existing)
      ? existing.replace(tokenLine, entry)
      : `${existing}${existing.endsWith('\n') ? '' : newline}${entry}${newline}`;

    await writeFile(envFile, updated, { mode: 0o600 });
    console.log(
      'Credencial local criada no .env. Demais configurações preservadas.',
    );
  }
}
