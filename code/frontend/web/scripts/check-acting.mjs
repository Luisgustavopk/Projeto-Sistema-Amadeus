import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createWebServer } from '../server.mjs';
import { ACTING_CATALOG } from '../../assets/avatar/acting/generated/catalog.mjs';

const output = fileURLToPath(
  new URL('../../../../.cache/acting-preview/', import.meta.url),
);
await mkdir(output, { recursive: true });
const originals = [
  'Kurisu.moc3',
  'Kurisu.model3.json',
  'Kurisu.4096/texture_00.png',
].map(
  (f) =>
    new URL('../../assets/avatar/local/modern/Kurisu/' + f, import.meta.url),
);
const hashes = () =>
  Promise.all(
    originals.map(async (p) =>
      createHash('sha256')
        .update(await readFile(p))
        .digest('hex'),
    ),
  );
const before = await hashes();
const server = createWebServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const errors = [],
  external = [];
const deadline = setTimeout(() => {
  console.error('Acting check deadline');
  void browser?.close();
}, 240000);
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
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
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
  await page.goto(base);
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).waitFor();
  await page.evaluate(() => {
    const Ticker = window.PIXI.Ticker;
    const originalStart = Ticker.prototype.start;
    Ticker.prototype.start = function () {
      if (this !== Ticker.shared) window.__actingTicker = this;
      return originalStart.call(this);
    };
    const Model = window.PIXI.live2d.Live2DModel,
      from = Model.from;
    Model.from = async function (...args) {
      const model = await from.apply(this, args);
      window.__actingModel = model;
      window.__actingMotions = [];
      const motion = model.motion.bind(model);
      model.motion = async (...args) => {
        const accepted = await motion(...args);
        if (args[0] === 'Amadeus')
          window.__actingMotions.push({ index: args[1], accepted });
        return accepted;
      };
      const c = model.internalModel.coreModel,
        parameters = c.getModel().parameters;
      window.__actingRanges = Object.fromEntries(
        parameters.ids.map((id, i) => [
          id,
          [parameters.minimumValues[i], parameters.maximumValues[i]],
        ]),
      );
      model.internalModel.on('beforeModelUpdate', () => {
        window.__actingBaseline = Object.fromEntries(
          parameters.ids.map((id) => [id, c.getParameterValueById(id)]),
        );
      });
      const update = c.update.bind(c);
      c.update = () => {
        window.__actingValues = Object.fromEntries(
          parameters.ids.map((id) => [id, c.getParameterValueById(id)]),
        );
        return update();
      };
      return model;
    };
  });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
  );
  await page.waitForFunction(() => Boolean(window.__actingValues), undefined, {
    timeout: 10000,
  });
  await page.evaluate(() => window.__actingTicker.stop());
  async function frames(count = 12) {
    return page.evaluate((count) => {
      const ticker = window.__actingTicker;
      for (let i = 0; i < count; i++) ticker.update(ticker.lastTime + 50);
      return {
        values: window.__actingValues,
        baseline: window.__actingBaseline,
        ranges: window.__actingRanges,
        shared: window.PIXI.Ticker.shared.started,
      };
    }, count);
  }
  await page
    .getByRole('button', { name: 'Expressões do avatar', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Mão no queixo / trocar braços' })
    .click();
  await frames();
  await page
    .getByText('Catálogo completo · 177 expressões e 10 movimentos', {
      exact: true,
    })
    .click();
  assert.equal(await page.locator('[data-expression]').count(), 177);
  const failures = [];
  for (const entry of ACTING_CATALOG.expressions) {
    const button = page.locator(`[data-expression="${entry.Name}"]`);
    assert.equal(await button.isEnabled(), true);
    await button.evaluate((el) => el.click());
    await page.waitForFunction(
      (name) =>
        document
          .querySelector(`[data-expression="${name}"]`)
          ?.getAttribute('aria-pressed') === 'true',
      entry.Name,
      { timeout: 5000 },
    );
    const state = await frames();
    assert.ok(state.values, 'Rig was not updated');
    for (const [id, value] of Object.entries(state.values))
      if (
        !Number.isFinite(value) ||
        value < state.ranges[id][0] - 0.001 ||
        value > state.ranges[id][1] + 0.001
      )
        failures.push(`${entry.Name}: ${id}=${value}`);
    for (const p of entry.parameters) {
      const baseline = state.baseline[p.Id];
      const raw =
        p.Blend === 'Multiply'
          ? baseline * p.Value
          : p.Blend === 'Overwrite'
            ? p.Value
            : baseline + p.Value;
      const expected =
        entry.Name === 'kz_neutra'
          ? baseline
          : Math.max(
              state.ranges[p.Id][0],
              Math.min(state.ranges[p.Id][1], raw),
            );
      if (Math.abs(state.values[p.Id] - expected) > 0.015)
        failures.push(
          `${entry.Name}: ${p.Id}=${state.values[p.Id]} expected ${expected}`,
        );
    }
    assert.equal(state.values.HandChange, 1, entry.Name + ': arm pose lost');
    assert.equal(state.shared, false);
    if (
      [
        'kz_piscadela_L',
        'kz_raiva_forte',
        'kz_vergonha_forte',
        'kz_olhos_marejados',
        'kz_neutra',
      ].includes(entry.Name)
    ) {
      await page
        .getByRole('button', { name: 'Fechar expressões', exact: true })
        .click();
      await page.screenshot({ path: output + '/' + entry.Name + '.png' });
      await page
        .getByRole('button', { name: 'Expressões do avatar', exact: true })
        .click();
    }
  }
  assert.deepEqual(failures, []);
  console.log('177 expressions: rig values and arm pose verified');
  await page.getByLabel('Emoção da atuação').selectOption('tristeza');
  await page.getByLabel('Intenção da atuação').selectOption('agradecer');
  await page.getByLabel(/Intensidade da atuação/).focus();
  await page.getByLabel(/Intensidade da atuação/).press('End');
  for (let i = 0; i < 20; i++)
    await page.getByLabel(/Intensidade da atuação/).press('ArrowLeft');
  await page
    .getByRole('button', { name: 'Aplicar atuação', exact: true })
    .evaluate((el) => el.click());
  const composed = await frames();
  assert.ok(Math.abs(composed.values.Sad - 0.8) < 0.001);
  assert.ok(Math.abs(composed.values.Smile - composed.baseline.Smile) < 0.001);
  await page.getByLabel('Emoção da atuação').selectOption('neutra');
  await page.getByLabel('Intenção da atuação').selectOption('conversar');
  await page
    .getByRole('button', { name: 'Aplicar atuação', exact: true })
    .evaluate((el) => el.click());
  await frames();
  for (const motion of ACTING_CATALOG.motions) {
    await page
      .locator(`[data-motion="${motion.Name}"]`)
      .evaluate((el) => el.click());
    await page.waitForFunction(
      (index) => window.__actingMotions.some((m) => m.index === index),
      ACTING_CATALOG.motions.indexOf(motion),
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-motion]')?.disabled,
    );
    const state = await frames(
      Math.ceil(((motion.duration + motion.FadeOutTime) * 1000) / 50) + 2,
    );
    assert.ok(Object.values(state.values).every(Number.isFinite));
  }
  assert.equal(
    await page.evaluate(() => window.__actingMotions.length),
    ACTING_CATALOG.motions.length,
  );
  assert.ok(
    await page.evaluate(() => window.__actingMotions.every((m) => m.accepted)),
    'Native motion manager rejected a motion',
  );
  await page.screenshot({ path: output + '/catalog-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + '/catalog-mobile.png' });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .getByRole('button', { name: 'Fechar expressões', exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: 'Expressões do avatar', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Mão no queixo / trocar braços' })
    .click();
  assert.equal((await frames()).values.HandChange, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(await hashes(), before);
  console.log(
    JSON.stringify(
      {
        expressions: 177,
        motions: ACTING_CATALOG.motions.length,
        composedSadGratitude: 'preserved',
        arms: 'independent',
        bounds: 'actual rig parameters',
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
