import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestServer } from "../server.mjs";
import { createTestReport } from "../report.mjs";

test("servidor publica somente arquivos da interface e módulos do cliente", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  for (const path of [
    "/",
    "/app.mjs",
    "/report.mjs",
    "/connection-status.mjs",
    "/styles.css",
    "/call-client/index.mjs",
    "/call-client/voice-timings.mjs",
    "/call-client/capture-worklet.js",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(
      response.headers
        .get("content-security-policy")
        .includes("script-src 'self'"),
    );
    await response.arrayBuffer();
  }
  for (const path of [
    "/.env",
    "/server.mjs",
    "/package.json",
    "/call-client/tests/vad.test.mjs",
    "/call-client/%2e%2e%2f.env",
  ]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base, { method: "POST" })).status, 405);
  assert.equal((await fetch(base, { method: "HEAD" })).status, 200);
});

test("classifica microfone como personal por padrão e restringe synthetic a entradas artificiais", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const html = await (await fetch(base + "/")).text();
  const app = await (await fetch(base + "/app.mjs")).text();

  assert.match(html, /id="data-class"/);
  assert.match(html, /value="personal" selected/);
  assert.match(html, /value="synthetic"/);
  assert.match(html, /microfone fica desabilitado/);
  assert.match(app, /dataClass: element\("data-class"\)\.value/);
  assert.match(app, /dataClass === "synthetic"/);
  assert.match(app, /personal-approved/);
  assert.match(app, /llm\.fallbacks/);
  assert.match(app, /Reservas não aprovadas serão puladas/);
  assert.doesNotMatch(app, /dataClass: "synthetic"/);
});

test("relatório omite conteúdo da conversa e credenciais; snapshots são independentes", () => {
  const report = createTestReport();
  report.event({
    type: "reply.text",
    turnId: 1,
    text: "texto privado",
    ticket: "segredo",
    credential: "token",
  });
  report.event({
    type: "connection.closed",
    code: 1012,
    wasClean: true,
    reason: "detalhe privado",
  });
  report.timing({
    stage: "firstAudioScheduled",
    turnId: 1,
    milliseconds: 1200,
  });
  const snapshot = report.snapshot({ hardwareAcceptanceConfirmed: false });
  const serialized = JSON.stringify(snapshot);
  for (const secret of ["texto privado", "segredo", "token", "detalhe privado"])
    assert.equal(serialized.includes(secret), false);
  assert.equal(snapshot.events[1].code, 1012);
  assert.equal(snapshot.events[1].wasClean, true);
  snapshot.timings[0].milliseconds = 999;
  snapshot.events[0].type = "alterado";
  assert.equal(report.snapshot({}).timings[0].milliseconds, 1200);
  assert.equal(report.snapshot({}).events[0].type, "reply.text");
});
