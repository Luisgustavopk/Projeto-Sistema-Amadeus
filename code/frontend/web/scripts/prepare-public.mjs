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
  for (const name of [
    'risada_balanco',
    'inclinar_para_frente',
    'abrir_bracos_leve',
  ])
    await rm(
      resolve(
        web,
        `public/live2d/amadeus/motions/amadeus/kz_${name}.motion3.json`,
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

// Optional authored rig. Only runtime files are public, never CMO3/PSD sources.
try {
  const extra = resolve(source, 'extra-rig');
  await access(resolve(extra, 'v16/Amadeus-rig-v16.model3.json'));
  try {
    await access(resolve(extra, 'sdk/CubismSdkForWeb-5-r.5/Framework/src/live2dcubismframework.ts'));
    await import('./build-extra-runtime.mjs');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await access(resolve(extra, 'runtime/extra-renderer.js'));
  await mkdir(resolve(web, 'public/live2d/extra-rig/v16'), { recursive: true });
  for (const name of ['Amadeus-rig-v16.model3.json', 'Amadeus-rig-v16.moc3', 'Amadeus-rig-v16.cdi3.json', 'Amadeus-rig-v16.4096'])
    await cp(resolve(extra, 'v16', name), resolve(web, 'public/live2d/extra-rig/v16', name), { recursive: true });
  await cp(resolve(extra, 'runtime'), resolve(web, 'public/live2d/extra-runtime'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('Rig extra local ausente; o avatar original continua disponível.');
}
