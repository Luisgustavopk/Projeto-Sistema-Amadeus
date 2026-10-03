import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

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
  console.log('Configuração local existente preservada.');
}
