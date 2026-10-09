import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createWebServer } from '../server.mjs';
import {
  DEFAULTS,
  STORAGE_KEY,
  loadPreferences,
  savePreferences,
} from '../src/features/settings/preferences.ts';

test('the preview serves only public UI assets and keeps file mounts inside their boundaries', async (t) => {
  // Use the public logo as a model fixture so this check also works without the private rig.
  const assets = fileURLToPath(new URL('../src/assets/', import.meta.url));
  const server = createWebServer({ models: assets });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /media-src 'none'/);
  assert.match(await page.text(), /Kurisu/);
  const rendered = await (await fetch(base)).text();
  assert.match(rendered, /id="root"/);
  const bundlePath = rendered.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const bundle = await fetch(base + bundlePath);
  assert.equal(bundle.status, 200);
  assert.match(bundle.headers.get('content-type'), /javascript/);
  await bundle.text();
  assert.doesNotMatch(rendered, /<!-- include:/);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(
    Number(head.headers.get('content-length')),
    Buffer.byteLength(rendered),
  );

  const logo = await fetch(base + '/live2d/amadeus/logo.png', {
    method: 'HEAD',
  });
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.equal(await logo.text(), '');
  for (const path of [
    '/.env',
    '/server.mjs',
    '/package.json',
    '/templates.mjs',
    '/src/main.jsx',
    '/modules/avatar.mjs',
    '/partials/home.html',
    '/assets/bg.mp4',
    '/v1/voice',
    '/live2d/amadeus/..%5Cpackage.json',
    '/live2d/amadeus/..%2Fpackage.json',
    '/live2d/runtime/manifest.json',
    '/live2d/amadeus/missing.moc3',
    '/%ZZ',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    await response.text();
  }
  const foreignHost = await new Promise((resolve, reject) => {
    const call = request(
      base,
      { headers: { Host: 'untrusted.invalid' } },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      },
    );
    call.once('error', reject);
    call.end();
  });
  assert.equal(foreignHost, 403);
  const post = await fetch(base, { method: 'POST', body: 'no API here' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('corrupt, unavailable or untrusted browser preferences do not break the session', () => {
  assert.deepEqual(
    loadPreferences({
      getItem() {
        throw new Error('Storage denied');
      },
    }),
    DEFAULTS,
  );
  assert.deepEqual(loadPreferences({ getItem: () => '{broken' }), DEFAULTS);
  const storage = {
    value: JSON.stringify({
      zoom: 999,
      animation: false,
      respectReducedMotion: true,
      tracking: false,
      apiKey: 'not a preference',
    }),
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      this.value = value;
    },
  };
  const preferences = loadPreferences(storage);
  assert.equal(preferences.zoom, 140);
  assert.equal('animation' in preferences, false);
  assert.equal('respectReducedMotion' in preferences, false);
  assert.equal(preferences.tracking, false);
  assert.equal('apiKey' in preferences, false);
  assert.equal(savePreferences(storage, { ...preferences, zoom: -100 }), true);
  assert.equal(loadPreferences(storage).zoom, 80);
  assert.equal(
    savePreferences(
      {
        setItem() {
          throw new Error('Quota');
        },
      },
      preferences,
    ),
    false,
  );
});
