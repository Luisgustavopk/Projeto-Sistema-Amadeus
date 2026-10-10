import { cp, mkdir, access, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const web = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(web, '../assets/avatar/local');
// The private assets retain their original names and internal references.
try {
  await access(resolve(source, 'modern/Kurisu/Kurisu.model3.json'));
  await mkdir(resolve(web, 'public/live2d'), { recursive: true });
  await cp(
    resolve(source, 'modern/Kurisu'),
    resolve(web, 'public/live2d/amadeus'),
    { recursive: true },
  );
  // Add parameter configurations in the public copy; never edit source binaries.
  for (const directory of ['exp', 'motions'])
    await cp(
      resolve(web, '../assets/avatar/acting/generated', directory),
      resolve(web, 'public/live2d/amadeus', directory),
      { recursive: true },
    );
  await rm(
    resolve(
      web,
      'public/live2d/amadeus/motions/amadeus/kz_risada_balanco.motion3.json',
    ),
    { force: true },
  );
  await mkdir(resolve(web, 'public/live2d/runtime'), { recursive: true });
  for (const file of [
    'pixi.min.js',
    'live2d.min.js',
    'live2dcubismcore.min.js',
    'live2d-display.min.js',
  ])
    await cp(
      resolve(source, 'viewer-runtime', file),
      resolve(web, 'public/live2d/runtime', file),
    );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn(
    'Live2D local ausente: restaure o modelo e os runtimes conforme README.',
  );
}
