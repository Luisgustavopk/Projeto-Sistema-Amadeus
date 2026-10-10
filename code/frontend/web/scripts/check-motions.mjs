import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createWebServer } from '../server.mjs';
const output = fileURLToPath(
  new URL('../../../../.cache/motion-preview/', import.meta.url),
);
await mkdir(output, { recursive: true });
const originalFiles = [
  'Kurisu.moc3',
  'Kurisu.model3.json',
  'Kurisu.4096/texture_00.png',
].map(
  (f) =>
    new URL('../../assets/avatar/local/modern/Kurisu/' + f, import.meta.url),
);
const hashes = () =>
  Promise.all(
    originalFiles.map(async (p) =>
      createHash('sha256')
        .update(await readFile(p))
        .digest('hex'),
    ),
  );
const original = await hashes();
const server = createWebServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const errors = [],
  external = [];
const deadline = setTimeout(() => {
  console.error('Motion check deadline');
  void browser?.close();
}, 180000);
try {
  browser = await chromium.launch({
    channel: process.env.UI_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    if (
      r
        .request()
        .url()
        .startsWith(base + '/')
    )
      return r.continue();
    external.push(r.request().url());
    return r.abort();
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).waitFor();
  await page.evaluate(() => {
    const Ticker = window.PIXI.Ticker,
      start = Ticker.prototype.start;
    Ticker.prototype.start = function () {
      if (this !== Ticker.shared) window.__motionTicker = this;
      return start.call(this);
    };
    const Model = window.PIXI.live2d.Live2DModel,
      from = Model.from;
    Model.from = async function (...args) {
      const model = await from.apply(this, args);
      window.__motionModel = model;
      const core = model.internalModel.coreModel,
        params = core.getModel().parameters;
      const update = core.update.bind(core);
      window.__motionRanges = Object.fromEntries(
        params.ids.map((id, i) => [
          id,
          [params.minimumValues[i], params.maximumValues[i]],
        ]),
      );
      core.update = () => {
        window.__motionValues = Object.fromEntries(
          params.ids.map((id) => [id, core.getParameterValueById(id)]),
        );
        return update();
      };
      const motion = model.motion.bind(model);
      window.__motionRequests = [];
      model.motion = async (...args) => {
        const accepted = await motion(...args);
        window.__motionRequests.push({ accepted });
        return accepted;
      };
      return model;
    };
  });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent ===
        'LIVE2D ATIVO' && window.__motionValues,
  );
  await page
    .getByRole('button', { name: 'Expressões do avatar', exact: true })
    .click();
  await page.getByRole('button', { name: /^Sorriso/ }).click();
  await page.waitForFunction(() => window.__motionValues.Smile > 0.99);
  const baseline = await page.evaluate(() => {
    window.__motionTicker.stop();
    return {
      scale: window.__motionModel.scale.x,
      x: window.__motionModel.x,
      y: window.__motionModel.y,
    };
  });
  async function frames(count) {
    return page.evaluate((count) => {
      const ticker = window.__motionTicker;
      for (let i = 0; i < count; i++) ticker.update(ticker.lastTime + 50);
      return {
        values: window.__motionValues,
        scale: window.__motionModel.scale.x,
        x: window.__motionModel.x,
        y: window.__motionModel.y,
        ranges: window.__motionRanges,
        focus: {
          x: window.__motionModel.internalModel.focusController.x,
          y: window.__motionModel.internalModel.focusController.y,
        },
        shared: window.PIXI.Ticker.shared.started,
      };
    }, count);
  }
  const cases = [
    ['virar_emburrada', 14, 78],
    ['inclinar_para_frente', 14, 72],
    ['surpresa_recuo', 6, 66],
    ['abrir_bracos_leve', 16, 72],
  ];
  let completed = 0;
  for (const [name, peak, finish] of cases) {
    await page
      .getByRole('button', { name: 'Expressões do avatar', exact: true })
      .click();
    await page
      .getByText('Catálogo completo · 177 expressões e 12 movimentos', {
        exact: true,
      })
      .evaluate((el) => {
        if (!el.parentElement.open) el.click();
      });
    assert.equal(
      await page.locator('[data-motion="kz_risada_balanco"]').count(),
      0,
    );
    await page
      .locator(`[data-motion="kz_${name}"]`)
      .evaluate((el) => el.click());
    await page.waitForFunction(
      (n) =>
        window.__motionRequests.length > n &&
        !document.querySelector('[data-motion]')?.disabled,
      completed,
    );
    const state = await frames(peak);
    for (const [id, v] of Object.entries(state.values))
      assert.ok(
        Number.isFinite(v) &&
          v >= state.ranges[id][0] - 0.001 &&
          v <= state.ranges[id][1] + 0.001,
        `${name}: ${id} out of range`,
      );
    assert.equal(state.shared, false);
    await page
      .getByRole('button', { name: 'Fechar expressões', exact: true })
      .click();
    if (name === 'virar_emburrada') {
      assert.equal(state.values.ParamEyeLOpen, 0);
      assert.equal(state.values.ParamEyeROpen, 0);
      assert.ok(Math.abs(state.values.ParamAngleX + 28) < 0.1);
      assert.equal(state.values.Smile, 0);
      await page.mouse.move(40, 40);
      const moved = await frames(1);
      assert.ok(
        Math.abs(moved.values.ParamAngleX - state.values.ParamAngleX) < 0.001,
      );
      assert.equal(moved.values.ParamEyeLOpen, 0);
    }
    if (name === 'inclinar_para_frente') {
      assert.ok(Math.abs(state.scale / baseline.scale - 1.18) < 0.001);
      assert.equal(state.values.ParamEyeLOpen, 0);
      assert.ok(state.values.ParamMouthOpenY > 0.2);
      assert.ok(state.values.ParamBodyAngleZ < -7);
    }
    if (name === 'surpresa_recuo') {
      assert.ok(state.scale / baseline.scale < 0.92);
      assert.equal(state.values.Surprissed, 1);
      assert.ok(state.values.ParamMouthOpenY > 0.4);
      assert.ok(state.values.ParamBodyAngleY > 8);
    }
    if (name === 'abrir_bracos_leve')
      assert.ok(Math.abs(state.values.UpperArmLPhy + 8) < 0.1);
    await page.screenshot({ path: output + '/' + name + '.png' });
    const reset = await frames(finish);
    assert.ok(Math.abs(reset.scale - baseline.scale) < 0.001);
    assert.ok(Math.abs(reset.y - baseline.y) < 0.001);
    assert.ok(reset.values.Smile > 0.99);
    assert.ok(reset.values.ParamMouthOpenY < 0.001);
    completed++;
  }
  assert.ok(
    await page.evaluate(() => window.__motionRequests.every((r) => r.accepted)),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(await hashes(), original);
  console.log(
    JSON.stringify(
      {
        motions: completed,
        eyes: 'closed while sulking',
        reaction: 'surprised with open mouth',
        framing: 'lean and recoil visible, baseline restored',
        arms: 'bounded light movement',
        originalHashes: 'unchanged',
        errors,
        external,
        output,
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await new Promise((r) => server.close(r));
}
