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
  // Observe the real primary Core, including frames where Pixi skips drawing it.
  await page.evaluate(() => {
    const Model = window.PIXI.live2d.Live2DModel, from = Model.from;
    Model.from = async function(...args) {
      const model = await from.apply(this, args);
      window.primaryRig = model;
      const raw = model.internalModel.coreModel.getModel();
      const vertices = raw.drawables.vertexPositions[raw.drawables.ids.indexOf('ArtMesh104')];
      const xs = Array.from(vertices).filter((_, i) => i % 2 === 0);
      const ys = Array.from(vertices).filter((_, i) => i % 2 === 1);
      window.nativeFace = { left: Math.min(...xs), right: Math.max(...xs), y: (Math.min(...ys) + Math.max(...ys))/2 };
      const update = model.internalModel.update;
      window.coreTicks = 0;
      model.internalModel.update = function(...args) {
        window.coreTicks++;
        return update.apply(this, args);
      };
      return model;
    };
  });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(() => document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO');
  await page.screenshot({ path: output + '/original.png' });

  async function checkFraming(iframe) {
    const state = await iframe.evaluate(() => window.extraRig.inspect());
    const native = await page.evaluate(() => {
      const model = window.primaryRig, im = model.internalModel;
      const c = im.coreModel.getModel().canvasinfo, face = window.nativeFace;
      const project = x => model.toGlobal(im.localTransform.apply({ x: c.CanvasOriginX+x*c.PixelsPerUnit, y: c.CanvasOriginY-face.y*c.PixelsPerUnit }));
      const left = project(face.left), right = project(face.right);
      const bounds = document.getElementById('avatar-canvas').getBoundingClientRect();
      return { width: right.x-left.x, x: bounds.left+(left.x+right.x)/2, y: bounds.top+(left.y+right.y)/2 };
    });
    const bounds = await page.locator('.avatar-extra-rig').boundingBox();
    const { projection: p, reference: face } = state;
    const extra = { width: p.xScale*face.width*bounds.width/2,
      x: bounds.x + (1+p.x+p.xScale*face.x)*bounds.width/2,
      y: bounds.y + (1-p.y-p.yScale*face.y)*bounds.height/2 };
    for (const key of ['width', 'x', 'y']) assert.ok(Math.abs(extra[key]-native[key]) < 1, `${key}: extra ${extra[key]}, original ${native[key]}`);
    return { native, extra };
  }

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
    const framing = await checkFraming(iframe);
    if (pose === 'hand-on-hip') {
      const baseline = await page.evaluate(() => ({ ticks: window.coreTicks, elapsed: window.primaryRig.elapsedTime }));
      await page.waitForFunction(start => window.primaryRig.elapsedTime > start+400, baseline.elapsed);
      assert.ok(await page.evaluate(ticks => !window.primaryRig.visible && window.coreTicks > ticks, baseline.ticks));
      // showModal() makes the underlying stage inert; exercise real pointer
      // input with the dialog closed, exactly as during a conversation.
      await page.getByRole('button', { name: 'Fechar expressões', exact: true }).click();
      const surface = await page.locator('main').boundingBox();
      await page.mouse.move(surface.x+10, surface.y+surface.height*.3);
      await iframe.waitForFunction(() => window.extraRig.inspect().parameters.find(p => p.id === 'ParamEyeBallX').value < -.2, undefined, { timeout: 10000 }).catch(async error => {
        console.error('Cursor diagnostic', await page.evaluate(() => {
          const im = window.primaryRig.internalModel;
          return { focus: { x: im.focusController.x, targetX: im.focusController.targetX }, parameters: ['ParamEyeBallX','ParamAngleX','ParamBreath'].map(id => [id, im.coreModel.getParameterValueById(id)]) };
        }), (await iframe.evaluate(() => window.extraRig.inspect())).parameters);
        throw error;
      });
      const left = await iframe.evaluate(() => window.extraRig.inspect());
      await page.mouse.move(surface.x+surface.width-10, surface.y+surface.height*.3);
      await iframe.waitForFunction(() => window.extraRig.inspect().parameters.find(p => p.id === 'ParamEyeBallX').value > .2);
      const right = await iframe.evaluate(() => window.extraRig.inspect());
      const faceIndex = right.drawables.indexOf('ArtMesh104');
      assert.ok(right.opacities[faceIndex] > 0);
      assert.notDeepEqual(left.vertices[faceIndex], right.vertices[faceIndex], 'Visible head geometry must follow the cursor');
      assert.notEqual(left.parameters.find(p => p.id === 'ParamBreath').value, right.parameters.find(p => p.id === 'ParamBreath').value);
      await page.getByRole('button', { name: 'Expressões do avatar', exact: true }).click();
    }
    await page.screenshot({ path: output + '/' + pose + '.png' });
    results.push({ pose, framing, offscreenOpacities: state.offscreens.opacities, backgroundPixel: state.backgroundPixel,
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
  await checkFraming(page.frames().find(frame => frame.url().includes('/extra-runtime/')));
  await page.screenshot({ path: output + '/mobile.png' });
  await page.locator('[data-rig-pose="original"]').click();
  await page.getByRole('button', { name: 'Fechar expressões', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar à tela inicial', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.avatar-extra-rig'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(failures, []);
  assert.deepEqual(await hashes(), before);
  await writeFile(output + '/results.json', JSON.stringify({ results, errors, failures, external, originalHashes: before }, null, 2));
  console.log('Rig v16: four poses, hidden Core simulation, visible head/cursor and breathing changes, face alignment within 1px on desktop/mobile, finite geometry, restore original, one iframe, no external calls, original hashes preserved. Facial selection does not validate absent authored controls.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
