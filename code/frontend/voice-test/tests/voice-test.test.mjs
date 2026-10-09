import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestServer, wordErrorRate } from "../server.mjs";
import { createTestReport } from "../report.mjs";
import { PcmSample } from "../stt-sample.mjs";

function createPcmWav(sampleRate = 16000) {
  const pcm = Buffer.alloc(3200);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

test("servidor publica somente arquivos da interface e módulos do cliente", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  for (const path of [
    "/",
    "/app.mjs",
    "/tts-diagnostic.mjs",
    "/report.mjs",
    "/connection-status.mjs",
    "/conversation-runtime.mjs",
    "/call-client/expression-playback.mjs",
    "/stt-sample.mjs",
    "/stt-diagnostic.mjs",
    "/speech-evaluation-client.mjs",
    "/styles.css",
    "/call-client/index.mjs",
    "/call-client/voice-timings.mjs",
    "/call-client/capture-worklet.js",
    "/call-client/pcm-resampler.mjs",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(
      response.headers
        .get("content-security-policy")
        .includes("script-src 'self'"),
    );
    assert.ok(
      response.headers
        .get("content-security-policy")
        .includes("media-src 'self' blob:"),
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

test("bloqueia chamadas de avaliação originadas fora da interface local", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/evaluation/stt", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /local interface/i);
  assert.equal(
    (
      await fetch(base + "/evaluation/stt", {
        method: "GET",
      })
    ).status,
    405,
  );
  const localResponse = await fetch(base + "/evaluation/tts", {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "unsupported", text: "teste" }),
  });
  assert.equal(localResponse.status, 400);
  assert.match((await localResponse.json()).error, /supported TTS model/i);
});

test("calcula WER ignorando maiúsculas, acentos e pontuação", () => {
  assert.deepEqual(
    wordErrorRate(
      "Hoje eu tive uma ideia diferente.",
      "hoje, EU tive uma ideia diferente!",
    ),
    {
      referenceWords: 6,
      recognizedWords: 6,
      wordErrors: 0,
      wer: 0,
    },
  );
  assert.deepEqual(wordErrorRate("ação número três", "acao numero"), {
    referenceWords: 3,
    recognizedWords: 2,
    wordErrors: 1,
    wer: 1 / 3,
  });
  assert.throws(() => wordErrorRate("   ", "texto"), /transcript/i);
});

test("executa Whisper local com WAV PCM e não envia gravação a Deepgram sem consentimento", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const sample = new PcmSample();
  for (let i = 0; i < 5; i++) sample.append(new Int16Array(320));
  const wav = Buffer.from(sample.wav()).toString("base64");
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.STT_SERVICE_TOKEN;
  process.env.STT_SERVICE_TOKEN = "test-service-token";
  let whisperCalled = false;
  globalThis.fetch = async (url, options) => {
    if (url === "http://127.0.0.1:8001/execute") {
      whisperCalled = true;
      assert.equal(
        options.headers.Authorization,
        "Bearer test-service-token",
      );
      const request = JSON.parse(options.body);
      assert.equal(request.audio.sampleRate, 16000);
      assert.equal(request.audio.channels, 1);
      assert.equal(
        Buffer.from(request.audio.pcmBase64, "base64").length,
        3200,
      );
      return Response.json({ content: "hoje, EU tive uma ideia diferente!" });
    }
    throw new Error("Unexpected provider request");
  };
  const post = (body) =>
    originalFetch(base + "/evaluation/stt", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    const local = await post({
      model: "faster-whisper",
      wavBase64: wav,
      expected: "Hoje eu tive uma ideia diferente.",
    });
    assert.equal(local.status, 200);
    const result = await local.json();
    assert.equal(result.wer, 0);
    assert.equal(result.model, "Local faster-whisper");
    assert.equal(whisperCalled, true);

    whisperCalled = false;
    const cloud = await post({
      model: "deepgram-nova-3",
      wavBase64: wav,
      expected: "Hoje eu tive uma ideia diferente.",
      confirmCloudUpload: false,
    });
    assert.equal(cloud.status, 400);
    assert.equal(whisperCalled, false);
    assert.match((await cloud.json()).error, /confirm the upload/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.STT_SERVICE_TOKEN;
    else process.env.STT_SERVICE_TOKEN = originalToken;
  }
});

test("sintetiza com Cartesia após consentimento e encaminha Qwen ao perfil ativo local", async (context) => {
  const server = createTestServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const originalFetch = globalThis.fetch;
  const names = ["CARTESIA_API_KEY", "TTS_SERVICE_TOKEN"];
  const originalValues = new Map(
    names.map((name) => [name, process.env[name]]),
  );
  process.env.CARTESIA_API_KEY = "test-cartesia-key";
  process.env.TTS_SERVICE_TOKEN = "test-tts-service-token";
  const cartesiaWav = createPcmWav(24000);
  let cartesiaCalls = 0;
  let qwenCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (url === "https://api.cartesia.ai/tts/bytes") {
      cartesiaCalls++;
      assert.equal(options.headers["X-API-Key"], "test-cartesia-key");
      const request = JSON.parse(options.body);
      assert.equal(request.model_id, "sonic-3.6");
      assert.equal(request.transcript, "Frase igual para comparar.");
      assert.equal(request.voice.id, "43df381e-ea60-4277-bd90-91ceb0c71007");
      return new Response(cartesiaWav, {
        headers: { "Content-Type": "audio/wav" },
      });
    }
    if (url === "http://127.0.0.1:3001/v1/voice/profile") {
      assert.equal(
        options.headers.Authorization,
        "Bearer api-test-token",
      );
      return Response.json({
        profile: {
          id: "5f86d3a4-3413-4f59-8c84-8e7a7c5e81e2",
          referenceFile: "reference.wav",
          referenceSha256: "a".repeat(64),
        },
      });
    }
    if (url === "http://127.0.0.1:8002/execute") {
      qwenCalls++;
      assert.equal(
        options.headers.Authorization,
        "Bearer test-tts-service-token",
      );
      const request = JSON.parse(options.body);
      assert.equal(request.role, "tts");
      assert.equal(request.content, "Frase igual para comparar.");
      assert.equal(request.voice.referenceFile, "reference.wav");
      return Response.json({
        audio: {
          pcmBase64: Buffer.alloc(3200).toString("base64"),
          sampleRate: 16000,
          channels: 1,
        },
      });
    }
    throw new Error("Unexpected provider request");
  };
  const post = (body) =>
    originalFetch(base + "/evaluation/tts", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    const cartesiaInput = {
      model: "cartesia-sonic-3.6",
      text: "Frase igual para comparar.",
      voiceId: "43df381e-ea60-4277-bd90-91ceb0c71007",
    };
    const withoutConsent = await post(cartesiaInput);
    assert.equal(withoutConsent.status, 400);
    assert.equal(cartesiaCalls, 0);
    assert.match((await withoutConsent.json()).error, /confirm the text upload/i);

    const cartesia = await post({
      ...cartesiaInput,
      confirmCloudUpload: true,
    });
    assert.equal(cartesia.status, 200);
    const cartesiaResult = await cartesia.json();
    assert.equal(cartesiaResult.sampleRate, 24000);
    assert.equal(Buffer.from(cartesiaResult.audioBase64, "base64").readUInt32LE(24), 24000);
    assert.equal(JSON.stringify(cartesiaResult).includes("test-cartesia-key"), false);

    const qwen = await post({
      model: "qwen-base",
      text: "Frase igual para comparar.",
      apiUrl: "http://127.0.0.1:3001",
      apiToken: "api-test-token",
    });
    assert.equal(qwen.status, 200);
    const qwenResult = await qwen.json();
    assert.equal(qwenResult.sampleRate, 16000);
    assert.equal(Buffer.from(qwenResult.audioBase64, "base64").readUInt32LE(24), 16000);
    assert.equal(cartesiaCalls, 1);
    assert.equal(qwenCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
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
  assert.match(html, /id="stt-model"/);
  assert.match(html, /id="tts-model"/);
  assert.match(html, /id="deepgram-consent"/);
  assert.match(html, /id="cartesia-voice-id"/);
  assert.match(html, /id="tts-cloud-consent"/);
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
