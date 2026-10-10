import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createWebServer } from '../server.mjs';

const output = fileURLToPath(
  new URL('../../../../.cache/web-preview/', import.meta.url),
);
await mkdir(output, { recursive: true });
const server = createWebServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const errors = [];
const externalRequests = [];
try {
  browser = await chromium.launch({
    channel: process.env.UI_BROWSER_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    if (
      route
        .request()
        .url()
        .startsWith(base + '/')
    )
      return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(base);
  // Observe actual rig parameters during rendering, not just the UI label.
  // The probe exists only in this temporary browser context.
  await page.evaluate(() => {
    const prototype = window.PIXI.live2d.Live2DModel.prototype;
    const original = prototype.expression;
    prototype.expression = function (...args) {
      if (!window.__expressionProbe) {
        window.__expressionProbe = {};
        this.internalModel.on('beforeModelUpdate', () => {
          for (const id of [
            'Angry',
            'ParamCheek',
            'Surprissed',
            'Smile',
            'Sad',
            'Scared',
          ]) {
            window.__expressionProbe[id] =
              this.internalModel.coreModel.getParameterValueById(id);
          }
        });
      }
      return original.apply(this, args);
    };
  });
  await page.screenshot({ path: output + '/welcome.png' });
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await page.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
    undefined,
    { timeout: 20000 },
  );
  // Ready means the rig loaded; wait for its first animated frame before capture.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.screenshot({ path: output + '/desktop.png' });
  for (const [label, text] of [
    ['Irritação', 'IRRITAÇÃO'],
    ['Constrangimento', 'CONSTRANGIMENTO'],
    ['Surpresa', 'SURPRESA'],
    ['Sorriso', 'SORRISO'],
    ['Tristeza', 'TRISTEZA'],
    ['Medo', 'MEDO'],
    ['Vergonha', 'VERGONHA'],
    ['Neutra', 'NEUTRA'],
  ]) {
    await page
      .getByRole('button', { name: 'Expressões do avatar', exact: true })
      .click();
    await page.getByRole('button', { name: new RegExp(label) }).click();
    if (await page.locator('#current-expression').count()) {
      await page.waitForFunction(
        (expected) =>
          document.getElementById('current-expression')?.textContent ===
          expected,
        text,
      );
      assert.equal(
        await page.locator('#current-expression').textContent(),
        text,
      );
    }
    const expected = {
      Irritação: ['Angry', 1],
      Constrangimento: ['ParamCheek', 0.5],
      Vergonha: ['ParamCheek', 1],
      Surpresa: ['Surprissed', 1],
      Sorriso: ['Smile', 1],
      Tristeza: ['Sad', 1],
      Medo: ['Scared', 1],
    }[label];
    await page.waitForFunction((expected) => {
      const parameters = window.__expressionProbe;
      return (
        parameters &&
        Object.entries(parameters).every(
          ([id, value]) =>
            Math.abs(value - (expected?.[0] === id ? expected[1] : 0)) < 0.01,
        )
      );
    }, expected ?? null);
    const parameters = await page.evaluate(() => window.__expressionProbe);
    for (const [id, value] of Object.entries(parameters)) {
      const target = expected?.[0] === id ? expected[1] : 0;
      assert.ok(
        Math.abs(value - target) < 0.01,
        `${label}: ${id} was ${value}, expected ${target}`,
      );
    }
    const filename = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    await page.screenshot({ path: output + '/' + filename + '.png' });
  }
  await page
    .getByRole('button', { name: 'Iniciar demonstração de voz' })
    .click();
  await page.waitForFunction(
    () =>
      document.getElementById('preview-speech').getAttribute('aria-pressed') ===
      'true',
  );
  assert.equal(
    await page.locator('#preview-speech').getAttribute('aria-pressed'),
    'true',
  );
  await page
    .getByRole('button', { name: 'Encerrar demonstração de voz' })
    .click();
  assert.equal(
    await page.locator('#speech-icon').getAttribute('href'),
    '#icon-mic',
  );
  assert.equal(
    await page.locator('#preview-speech').getAttribute('aria-pressed'),
    'false',
  );

  await page
    .getByRole('button', { name: 'Conversar por texto', exact: true })
    .click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'message');
  const sample = '<img src=x onerror=alert(1)> Texto local de teste.';
  await page
    .getByRole('textbox', { name: 'Mensagem', exact: true })
    .fill(sample);
  await page
    .getByRole('button', { name: 'Enviar mensagem', exact: true })
    .click();
  assert.match(
    await page.locator('#chat-log').textContent(),
    /Texto local de teste/,
  );
  assert.equal(await page.locator('#chat-log img').count(), 0);
  await page.screenshot({ path: output + '/chat.png' });
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute('aria-label'),
    ),
    'Conversar por texto',
  );

  await page
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await page.getByRole('slider', { name: 'Enquadramento' }).focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('#zoom-value').textContent(), '140%');
  await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  assert.equal(await page.locator('#setting-zoom').inputValue(), '140');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    isMobile: true,
    hasTouch: true,
  });
  await mobile.route('**/*', (route) =>
    route
      .request()
      .url()
      .startsWith(base + '/')
      ? route.continue()
      : route.abort(),
  );
  const small = await mobile.newPage();
  small.on('pageerror', (error) => errors.push(error.message));
  await small.goto(base);
  await small.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await small.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
  );
  assert.equal(
    await small.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await small.screenshot({ path: output + '/mobile.png' });
  await small
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await small.screenshot({ path: output + '/mobile-settings.png' });
  assert.equal(
    await small.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await small.keyboard.press('Escape');
  await small.setViewportSize({ width: 844, height: 390 });
  await small.screenshot({ path: output + '/landscape.png' });
  assert.equal(
    await small.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );

  // Exercise the real animated renderer and a missing-model recovery in a fresh session.
  const recovery = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  let failModel = true;
  await recovery.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(base + '/')) {
      externalRequests.push(url);
      return route.abort();
    }
    if (url === base + '/') {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        /id="root"(?: data-signal-monitor="[^"]*")?/,
        'id="root" data-signal-monitor="false"',
      );
      return route.fulfill({ response, body: html });
    }
    if (url.endsWith('/live2d/amadeus/Kurisu.model3.json') && failModel) {
      failModel = false;
      return route.fulfill({ status: 404, body: '' });
    }
    return route.continue();
  });
  const retry = await recovery.newPage();
  retry.on('pageerror', (error) => errors.push(error.message));
  await retry.goto(base);
  assert.equal(await retry.locator('.telemetry').count(), 0);
  assert.equal(await retry.locator('#toggle-motion').count(), 0);
  assert.equal(await retry.locator('#setting-animation').count(), 0);
  assert.equal(await retry.locator('#setting-respectReducedMotion').count(), 0);
  await retry.evaluate(() => {
    window.__backgroundFrame = document
      .getElementById('welcome-background')
      .toDataURL();
  });
  await retry.waitForFunction(
    () =>
      document.getElementById('welcome-background').toDataURL() !==
      window.__backgroundFrame,
  );
  await retry.screenshot({ path: output + '/welcome-animated.png' });
  await retry.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await retry.evaluate(() => {
    const Model = window.PIXI.live2d.Live2DModel;
    const original = Model.from;
    Model.from = async function (...args) {
      const model = await original.apply(this, args);
      window.__motionModel = model;
      model.internalModel.on('beforeModelUpdate', () => {
        window.__renderedGaze = {
          eye: model.internalModel.coreModel.getParameterValueById(
            'ParamEyeBallX',
          ),
          angle:
            model.internalModel.coreModel.getParameterValueById('ParamAngleX'),
        };
      });
      return model;
    };
  });
  await retry.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent ===
      'AVATAR INDISPONÍVEL',
  );
  assert.equal(await retry.locator('#preview-speech').isDisabled(), true);
  await retry.screenshot({ path: output + '/missing-model.png' });
  await retry.locator('#retry-avatar').click();
  await retry.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
  );
  assert.equal(
    await retry.evaluate(() => window.__motionModel.autoUpdate),
    false,
  );
  const measureClock = () =>
    retry.evaluate(async () => {
      const start = performance.now();
      const elapsed = window.__motionModel.elapsedTime;
      await new Promise((resolve) => setTimeout(resolve, 900));
      return (
        (window.__motionModel.elapsedTime - elapsed) /
        (performance.now() - start)
      );
    });
  const baselineSpeed = await measureClock();
  assert.ok(
    baselineSpeed > 0 && baselineSpeed <= 1.15,
    `single-clock baseline ${baselineSpeed}`,
  );
  await retry
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  const zoomArtificialAdvance = await retry
    .locator('#setting-zoom')
    .evaluate((input) => {
      const before = window.__motionModel.elapsedTime;
      for (let round = 0; round < 40; round++) {
        input.value = round % 2 ? '80' : '140';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.value = '100';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return window.__motionModel.elapsedTime - before;
    });
  assert.equal(
    zoomArtificialAdvance,
    0,
    'scale controls must not advance simulation time',
  );
  await retry.keyboard.press('Escape');
  for (const expression of ['Irritação', 'Sorriso', 'Tristeza', 'Neutra']) {
    await retry
      .getByRole('button', { name: 'Expressões do avatar', exact: true })
      .click();
    await retry.getByRole('button', { name: new RegExp(expression) }).click();
    await retry.waitForFunction(
      () => !document.getElementById('avatar-dialog').open,
    );
  }
  const afterSpeed = await measureClock();
  assert.ok(
    afterSpeed > 0 && afterSpeed <= 1.15,
    `zoom/expression changes accelerated the clock: ${afterSpeed}`,
  );
  assert.equal(await retry.locator('#setting-zoom').inputValue(), '100');
  await retry
    .getByRole('button', { name: 'Expressões do avatar', exact: true })
    .click();
  await retry.getByRole('button', { name: /Sorriso/ }).click();
  await retry.waitForFunction(
    () => !document.getElementById('avatar-dialog').open,
  );
  await retry
    .getByRole('button', { name: 'Iniciar demonstração de voz' })
    .click();
  await retry.waitForFunction(
    () =>
      document.getElementById('preview-speech').getAttribute('aria-pressed') ===
      'true',
  );
  await retry
    .getByRole('button', { name: 'Encerrar demonstração de voz' })
    .click();
  await retry
    .getByRole('button', { name: 'Expressões do avatar', exact: true })
    .click();
  await retry.getByRole('button', { name: /Neutra/ }).click();
  await retry.waitForFunction(
    () => !document.getElementById('avatar-dialog').open,
  );
  await retry.evaluate(() => {
    window.__rigFrame = JSON.stringify(
      ['ParamAngleX', 'ParamAngleY', 'ParamBreath', 'ParamEyeLOpen'].map((id) =>
        window.__motionModel.internalModel.coreModel.getParameterValueById(id),
      ),
    );
  });
  await retry.waitForFunction(
    () =>
      JSON.stringify(
        ['ParamAngleX', 'ParamAngleY', 'ParamBreath', 'ParamEyeLOpen'].map(
          (id) =>
            window.__motionModel.internalModel.coreModel.getParameterValueById(
              id,
            ),
        ),
      ) !== window.__rigFrame,
  );
  const targets = await retry.evaluate(() => {
    const surface = document.getElementById('home');
    const rect = surface.getBoundingClientRect();
    const controller = window.__motionModel.internalModel.focusController;
    const sample = (x, y) => {
      surface.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + rect.width * x,
          clientY: rect.top + rect.height * y,
          pointerType: 'mouse',
        }),
      );
      return [controller.targetX, controller.targetY];
    };
    return {
      centre: sample(0.5, 0.3),
      near: sample(0.51, 0.3),
      right: sample(1, 0.3),
      left: sample(0, 0.3),
      below: sample(0.5, 1),
    };
  });
  assert.ok(targets.centre.every((value) => Math.abs(value) < 1e-6));
  assert.ok(
    targets.near[0] > 0 && targets.near[0] < 0.02,
    'near centre must not produce a full-strength jump',
  );
  assert.ok(targets.right[0] <= 0.45 && targets.right[0] > 0);
  assert.ok(targets.left[0] >= -0.45 && targets.left[0] < 0);
  assert.ok(targets.below[1] >= -0.3 && targets.below[1] < 0);
  await retry.locator('#home').dispatchEvent('pointerleave');
  assert.equal(
    await retry.evaluate(
      () => window.__motionModel.internalModel.focusController.targetX,
    ),
    0,
  );
  // Real mouse events across the narrower canvas and interactive overlays.
  await retry.mouse.move(1180, 250);
  await retry.waitForFunction(
    () => window.__motionModel.internalModel.focusController.x > 0.3,
  );
  const rightPose = await retry.evaluate(() => window.__renderedGaze.eye);
  await retry.screenshot({ path: output + '/gaze-right.png' });
  await retry.mouse.move(1235, 250);
  assert.ok(
    await retry.evaluate(
      () => window.__motionModel.internalModel.focusController.targetX > 0.4,
    ),
    'crossing a rail button must not recenter the gaze',
  );
  await retry.evaluate(() => {
    window.__gazeFrames = [];
    window.__gazeListener = () => {
      const c = window.__motionModel.internalModel.focusController;
      window.__gazeFrames.push({
        x: c.x,
        targetX: c.targetX,
        eye: window.__motionModel.internalModel.coreModel.getParameterValueById(
          'ParamEyeBallX',
        ),
      });
    };
    window.__motionModel.internalModel.on(
      'beforeModelUpdate',
      window.__gazeListener,
    );
  });
  await retry.mouse.move(75, 250);
  await retry.waitForFunction(
    () => window.__motionModel.internalModel.focusController.x < -0.3,
  );
  const leftPose = await retry.evaluate(() => window.__renderedGaze.eye);
  assert.ok(
    leftPose < rightPose,
    'rendered eye parameters must follow the pointer, not only the target',
  );
  const samples = await retry.evaluate(() => {
    window.__motionModel.internalModel.off(
      'beforeModelUpdate',
      window.__gazeListener,
    );
    return window.__gazeFrames.filter((frame) => frame.targetX < -0.3);
  });
  assert.ok(samples.length > 3);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      samples[i].x <= samples[i - 1].x + 1e-6,
      'direction reversal must ease monotonically',
    );
    assert.ok(
      samples[i].x >= samples[i].targetX - 1e-6,
      'gaze must not overshoot',
    );
  }
  await retry.screenshot({ path: output + '/gaze-left.png' });
  await retry.mouse.move(1150, 90);
  assert.ok(
    await retry.evaluate(
      () => window.__motionModel.internalModel.focusController.targetX > 0,
    ),
    'header must remain part of the pointer surface',
  );
  const texture = await retry
    .locator('.control-rail .icon-button')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el, '::before');
      return {
        image: style.backgroundImage,
        size: style.backgroundSize,
        animation: style.animationName,
      };
    });
  assert.match(texture.image, /radial-gradient/);
  assert.equal(texture.size, '3px 3px');
  assert.equal(texture.animation, 'none');
  await retry.evaluate(() => {
    window.__backgroundFrame = document
      .getElementById('stage-background')
      .toDataURL();
  });
  await retry.waitForFunction(
    () =>
      document.getElementById('stage-background').toDataURL() !==
      window.__backgroundFrame,
  );
  await retry.screenshot({ path: output + '/desktop-animated.png' });
  await retry
    .getByRole('button', { name: 'Configurações', exact: true })
    .click();
  await retry.locator('#setting-tracking').uncheck();
  assert.equal(
    await retry.evaluate(() => window.__motionModel.autoUpdate),
    false,
    'the Live2D shared ticker must remain disabled',
  );
  await retry.locator('#setting-tracking').check();
  await retry.locator('#setting-effects').uncheck();
  assert.equal(await retry.locator('.scanlines').last().isVisible(), false);
  assert.equal(
    await retry.evaluate(
      () =>
        getComputedStyle(document.getElementById('settings-dialog'), '::before')
          .display,
    ),
    'none',
  );
  await retry.locator('#setting-effects').check();
  await retry.keyboard.press('Escape');
  await retry
    .getByRole('button', { name: 'Iniciar demonstração de voz' })
    .click();
  await retry.waitForFunction(
    () =>
      document.getElementById('preview-speech').getAttribute('aria-pressed') ===
      'true',
  );
  await retry.getByRole('button', { name: 'Voltar à tela inicial' }).click();
  assert.equal(await retry.locator('#preview-speech').count(), 0);
  assert.equal(await retry.locator('#welcome').isVisible(), true);
  await retry.getByRole('button', { name: 'INICIAR INTERFACE' }).click();
  await retry.waitForFunction(
    () =>
      document.getElementById('avatar-status')?.textContent === 'LIVE2D ATIVO',
  );
  assert.equal(
    await retry.locator('#preview-speech').getAttribute('aria-pressed'),
    'false',
  );
  assert.equal(
    await retry.locator('#avatar-status').textContent(),
    'LIVE2D ATIVO',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    JSON.stringify(
      {
        live2d: 'rendered',
        expressions: 8,
        desktop: '1440x900',
        mobile: '390x844',
        landscape: '844x390',
        recovery: 'missing model + retry',
        localChat: 'safe text',
        settings: 'persisted',
        clock: {
          baselineSpeed,
          afterSpeed,
          zoomChanges: 41,
          expressionChanges: 6,
          zoomArtificialAdvance,
        },
        optionalTelemetry: 'removed without breaking renderer or expressions',
        keyboard: 'focus restored',
        crt: 'always-animated avatar and backgrounds, subtle scanlines, grain off, microphone demo',
        externalRequests: 0,
        screenshots: output,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
