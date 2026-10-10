import { chromium } from 'playwright-core';
import { createWebServer } from '../server.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeLayeredPsd } from './lib/write-layered-psd.mjs';

// Fixed local destination, ignored by Git. Original assets are read only.
const output = new URL(
  '../../assets/avatar/local/authoring-v1/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const source = new URL(
  '../../assets/avatar/local/modern/Kurisu/',
  import.meta.url,
);
const sourceHashes = {};
for (const f of [
  'Kurisu.moc3',
  'Kurisu.model3.json',
  'Kurisu.4096/texture_00.png',
])
  sourceHashes[f] = createHash('sha256')
    .update(await readFile(new URL(f, source)))
    .digest('hex');
const server = createWebServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let browser;
const inventory = [];
let icc;
if (process.platform === 'win32') {
  try {
    icc = await readFile(
      resolve(
        process.env.SystemRoot ?? 'C:/Windows',
        'System32/spool/drivers/color/sRGB Color Space Profile.icm',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
try {
  browser = await chromium.launch({
    channel: process.env.UI_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1800 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(60000);
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.route('**/*', (r) =>
    r
      .request()
      .url()
      .startsWith(base + '/')
      ? r.continue()
      : r.abort(),
  );
  await page.goto(base);
  await page.evaluate(() => {
    const M = window.PIXI.live2d.Live2DModel,
      from = M.from;
    M.from = async function (...args) {
      const m = await from.apply(this, args);
      window.__authoringModel = m;
      return m;
    };
    const A = window.PIXI.Application;
    window.PIXI.Application = class extends A {
      constructor(...args) {
        super(...args);
        window.__authoringApp = this;
      }
    };
  });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
  );
  await page.evaluate(() => {
    const m = window.__authoringModel,
      app = window.__authoringApp;
    app.ticker.stop();
    m.internalModel.motionManager.stopAllMotions();
    // Freeze a frame and fit the drawing inside the original stage.
    m.removeAllListeners();
    m.internalModel.removeAllListeners('beforeModelUpdate');
    m.scale.set(m.scale.x * 0.8);
    m.y = m.y * 0.8 + app.renderer.height * 0.1;
    window.__authoringFilters = m.filters;
    m.filters = null;
    window.__authoringDraw = m.internalModel.renderer.drawMesh;
    const canvas = document.createElement('canvas');
    canvas.width = app.renderer.width;
    canvas.height = app.renderer.height;
    window.__authoringCanvas = canvas;
  });
  for (const [state, hand] of [
    ['neutral', 0],
    ['hand-on-chin', 1],
  ]) {
    const info = await page.evaluate(
      ({ hand }) => {
        const m = window.__authoringModel,
          c = m.internalModel.coreModel,
          raw = c.getModel();
        raw.parameters.values.set(raw.parameters.defaultValues);
        c.setParameterValueById('HandChange', hand);
        c.update();
        return {
          width: window.__authoringApp.renderer.width,
          height: window.__authoringApp.renderer.height,
          layers: raw.drawables.ids
            .map((id, n) => ({
              id,
              index: n,
              opacity: raw.drawables.opacities[n],
              order: raw.drawables.renderOrders[n],
              masks: Array.from(raw.drawables.masks[n]),
              blend: c.getDrawableBlendMode(n),
            }))
            .filter((l) => l.opacity > 0.0001)
            .sort((a, b) => a.order - b.order),
        };
      },
      { hand },
    );
    const stateOutput = new URL(state + '/', output);
    await mkdir(stateOutput, { recursive: true });
    const extract = async (index = null, palette = false) =>
      page.evaluate(
        ({ index, palette }) => {
          const m = window.__authoringModel,
            app = window.__authoringApp,
            r = m.internalModel.renderer,
            c = m.internalModel.coreModel;
          const original = window.__authoringDraw,
            target = index === null ? null : c.getDrawableVertexIndices(index);
          r.drawMesh = function (...args) {
            if (
              target === null ||
              this.getClippingContextBufferForMask() ||
              args.includes(target)
            )
              return original.apply(this, args);
          };
          m.filters = palette ? window.__authoringFilters : null;
          app.render();
          const canvas = app.renderer.extract.canvas();
          const ctx = canvas.getContext('2d'),
            data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let left = canvas.width,
            top = canvas.height,
            right = -1,
            bottom = -1;
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++)
              if (data[(y * canvas.width + x) * 4 + 3]) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
              }
          if (right < 0) return null;
          const full = index === null;
          if (full) {
            left = top = 0;
            right = canvas.width - 1;
            bottom = canvas.height - 1;
          }
          const crop = ctx.getImageData(
            left,
            top,
            right - left + 1,
            bottom - top + 1,
          );
          const out = window.__authoringCanvas;
          out.width = crop.width;
          out.height = crop.height;
          out.getContext('2d').putImageData(crop, 0, 0);
          let str = '';
          for (let i = 0; i < crop.data.length; i += 8192)
            str += String.fromCharCode(...crop.data.subarray(i, i + 8192));
          r.drawMesh = original;
          m.filters = null;
          return {
            left,
            top,
            width: crop.width,
            height: crop.height,
            png: out.toDataURL('image/png').split(',')[1],
            rgba: btoa(str),
          };
        },
        { index, palette },
      );
    const merged = await extract();
    const current = await extract(null, true);
    await writeFile(
      new URL('original-composite.png', stateOutput),
      Buffer.from(merged.png, 'base64'),
    );
    await writeFile(
      new URL('current-palette-reference.png', stateOutput),
      Buffer.from(current.png, 'base64'),
    );
    const layers = [];
    for (const l of info.layers) {
      const pixels = await extract(l.index);
      if (!pixels) continue;
      await writeFile(
        new URL(l.id + '.png', stateOutput),
        Buffer.from(pixels.png, 'base64'),
      );
      layers.push({
        ...l,
        ...pixels,
        blend: l.blend === 1 ? 'add' : l.blend === 2 ? 'multiply' : 'normal',
      });
    }
    const rgba = Buffer.from(merged.rgba, 'base64');
    await writeFile(
      new URL('source-art.psd', stateOutput),
      writeLayeredPsd({ ...info, layers, merged: rgba, icc }),
    );
    const summary = {
      state,
      width: info.width,
      height: info.height,
      layers: layers.map(({ png, rgba, ...l }) => l),
    };
    await writeFile(
      new URL('layers.json', stateOutput),
      JSON.stringify(summary, null, 2) + '\n',
    );
    inventory.push(summary);
    console.log(`${state}: ${layers.length} original raster layers exported`);
  }
  for (const [f, hash] of Object.entries(sourceHashes))
    if (
      createHash('sha256')
        .update(await readFile(new URL(f, source)))
        .digest('hex') !== hash
    )
      throw new Error('Source changed: ' + f);
  await writeFile(
    new URL('provenance.json', output),
    JSON.stringify(
      {
        sourceHashes,
        type: 'rendered-original-art',
        caveat:
          'Flattened per-drawable snapshots, not original PSD or CMO3; no recovered deformers or hidden keyforms. Source colors; current shader palette is a separate reference.',
        states: inventory.map((s) => ({
          state: s.state,
          layers: s.layers.length,
        })),
      },
      null,
      2,
    ) + '\n',
  );
  // Offline inspector: reads the exported PNGs, never changes the live avatar.
  const data = JSON.stringify(inventory).replaceAll('<', '\\u003c');
  await writeFile(
    new URL('index.html', output),
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Base original — Kurisu</title>
<style>body{margin:0;padding:24px;background:#111820;color:#eee;font:16px system-ui}h1{font-size:24px}a{color:#ffc66d}main{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1fr);gap:24px}.preview{background:repeating-conic-gradient(#202a34 0% 25%,#18222c 0% 50%) 0 0/24px 24px;min-height:360px;display:grid;place-items:center}.preview img{max-height:75vh;max-width:100%;object-fit:contain}#layers{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;max-height:75vh;overflow:auto}button{background:#202a34;color:inherit;border:1px solid #485365;padding:8px;cursor:pointer}button img{height:84px;width:100%;object-fit:contain}select{padding:8px;margin-bottom:16px}@media(max-width:700px){main{grid-template-columns:1fr}}</style>
<h1>Desenhos originais — base de autoria</h1><p>Camadas raster exportadas do modelo. Não é o projeto Cubism recuperado nem uma pose nova.</p>
<select id="state" aria-label="Pose original"><option value="neutral">Neutra</option><option value="hand-on-chin">Mão no queixo</option></select> <a id="psd">Abrir PSD em camadas</a>
<main><section><div class="preview"><img id="preview" alt="Desenho original"></div><p id="label"></p><button id="original">Composição original</button> <button id="palette">Referência da paleta atual</button></section><section><h2>ArtMeshes</h2><div id="layers"></div></section></main>
<script>const states=${data};const state=document.getElementById('state'),preview=document.getElementById('preview'),label=document.getElementById('label');function show(file,name){preview.src=state.value+'/'+file;label.textContent=name}function refresh(){const s=states.find(s=>s.state===state.value);const list=document.getElementById('layers');list.replaceChildren();document.getElementById('psd').href=state.value+'/source-art.psd';for(const l of s.layers){const b=document.createElement('button'),img=document.createElement('img');img.src=state.value+'/'+l.id+'.png';img.alt='';b.append(img,document.createTextNode(l.id));b.onclick=()=>show(l.id+'.png',l.id+' · ordem '+l.order);list.append(b)}show('current-palette-reference.png','Referência da paleta atual; shader aplicado na composição')}state.onchange=refresh;document.getElementById('original').onclick=()=>show('original-composite.png','Composição nas cores de origem');document.getElementById('palette').onclick=()=>show('current-palette-reference.png','Referência da paleta atual');refresh();</script></html>`,
  );
  console.log('Saved: ' + fileURLToPath(output));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
