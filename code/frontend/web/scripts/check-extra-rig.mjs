import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createWebServer } from '../server.mjs';

const output = fileURLToPath(new URL('../../../../.cache/extra-rig-preview/', import.meta.url));
await mkdir(output, { recursive: true });
const files = ['Kurisu.moc3', 'Kurisu.model3.json', 'Kurisu.4096/texture_00.png']
  .map(file => new URL('../../assets/avatar/local/modern/Kurisu/' + file, import.meta.url));
const hashes = () => Promise.all(files.map(async file => createHash('sha256').update(await readFile(file)).digest('hex')));
const before = await hashes();
const server = createWebServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const errors = [], external = [], failures = [], results = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failures.push(response.url()); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(() => document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO');
  await page.getByRole('button', { name: 'Expressões do avatar', exact: true }).click();
  for (const pose of ['arms-crossed', 'hand-on-hip', 'idea-pointing', 'lean-forward']) {
    await page.locator(`[data-rig-pose="${pose}"]`).click();
    await page.waitForFunction(pose => document.querySelector(`[data-rig-pose="${pose}"]`)?.getAttribute('aria-pressed') === 'true', pose);
    const iframe = page.frames().find(frame => frame.url().includes('/extra-runtime/'));
    assert.ok(iframe);
    await iframe.waitForFunction(expected => window.extraRig.inspect().parameters.find(p => p.id === 'ParamLeanForward').value === expected, pose === 'lean-forward' ? 1 : 0);
    const state = await iframe.evaluate(() => window.extraRig.inspect());
    const value = id => state.parameters.find(p => p.id === id).value;
    assert.equal(value('ParamArmPose'), pose === 'arms-crossed' ? 1 : pose === 'idea-pointing' ? 3 : 2);
    assert.equal(value('ParamLeanForward'), pose === 'lean-forward' ? 1 : 0);
    assert.ok(state.vertices.every(vertices => vertices.every(Number.isFinite)));
    assert.equal(state.backgroundPixel[3], 0);
    assert.equal(await page.locator('#avatar-canvas').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('.avatar-extra-rig').count(), 1);
    await page.screenshot({ path: output + '/' + pose + '.png' });
    results.push({ pose, offscreenOpacities: state.offscreens.opacities, backgroundPixel: state.backgroundPixel,
      colors: await iframe.evaluate(() => ({html: getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,colorScheme:getComputedStyle(document.documentElement).colorScheme})) });
  }
  await page.getByRole('button', { name: 'Sorriso', exact: false }).first().click();
  await page.getByRole('button', { name: 'Expressões do avatar', exact: true }).click();
  await page.locator('[data-rig-pose="original"]').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('avatar-canvas')).visibility === 'visible');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-rig-pose="hand-on-hip"]').click();
  await page.waitForFunction(() => document.querySelector('[data-rig-pose="hand-on-hip"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.avatar-extra-rig').count(), 1);
  await page.screenshot({ path: output + '/mobile.png' });
  await page.locator('[data-rig-pose="original"]').click();
  await page.getByRole('button', { name: 'Fechar expressões', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar à tela inicial', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.avatar-extra-rig'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(failures, []);
  assert.deepEqual(await hashes(), before);
  await writeFile(output + '/results.json', JSON.stringify({ results, errors, failures, external, originalHashes: before }, null, 2));
  console.log('Rig v16: four poses, finite geometry, restore original, facial selection, mobile, one iframe, no external calls, original hashes preserved.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
