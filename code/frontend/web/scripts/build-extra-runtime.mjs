import { build } from 'vite';
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url));
const sdk = fileURLToPath(new URL('../../assets/avatar/local/extra-rig/sdk/CubismSdkForWeb-5-r.5/', import.meta.url));
const output = fileURLToPath(new URL('../../assets/avatar/local/extra-rig/runtime/', import.meta.url));
await access(sdk + '/Framework/src/live2dcubismframework.ts');
await mkdir(output, { recursive: true });
await build({
  configFile: false, root: web,
  resolve: { alias: { '@cubism-sdk': sdk + '/Framework/src' } },
  build: { outDir: output, emptyOutDir: false, lib: {
    entry: web + '/src/features/avatar/runtime/extra-renderer.mjs',
    formats: ['es'], fileName: () => 'extra-renderer.js',
  } },
});
await cp(sdk + '/Core/live2dcubismcore.min.js', output + '/live2dcubismcore.min.js');
await cp(sdk + '/Framework/Shaders/WebGL', output + '/shaders', { recursive: true });
await cp(sdk + '/LICENSE.md', output + '/LICENSE.md');
await writeFile(output + '/index.html', '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="stage.css"><script src="live2dcubismcore.min.js"></script><script type="module" src="extra-renderer.js"></script></head><body><canvas id="stage" aria-label="Rig extra Live2D"></canvas></body></html>');
await writeFile(output + '/stage.css', 'html{color-scheme:dark}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}');
