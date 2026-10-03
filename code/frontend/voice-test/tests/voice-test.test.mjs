import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestServer } from '../server.mjs';
import { createTestReport } from '../report.mjs';

test('servidor publica somente arquivos da interface e módulos do cliente', async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const path of ['/', '/app.mjs', '/report.mjs', '/styles.css', '/call-client/index.mjs', '/call-client/capture-worklet.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
    await response.arrayBuffer();
  }
  for (const path of ['/.env', '/server.mjs', '/package.json', '/call-client/tests/vad.test.mjs', '/call-client/%2e%2e%2f.env']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
});

test('relatório omite conteúdo da conversa e credenciais; snapshots são independentes', () => {
  const report = createTestReport();
  report.event({ type: 'reply.text', turnId: 1, text: 'texto privado', ticket: 'segredo', credential: 'token' });
  report.timing({ stage: 'firstAudioScheduled', turnId: 1, milliseconds: 1200 });
  const snapshot = report.snapshot({ hardwareAcceptanceConfirmed: false });
  const serialized = JSON.stringify(snapshot);
  for (const secret of ['texto privado', 'segredo', 'token']) assert.equal(serialized.includes(secret), false);
  snapshot.timings[0].milliseconds = 999;
  snapshot.events[0].type = 'alterado';
  assert.equal(report.snapshot({}).timings[0].milliseconds, 1200);
  assert.equal(report.snapshot({}).events[0].type, 'reply.text');
});
