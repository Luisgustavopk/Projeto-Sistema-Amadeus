import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, "../../..");
const apiDirectory = resolve(repository, "code/backend/api");
const servicesDirectory = resolve(repository, "code/backend/services");
const allowed = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.mjs": "app.mjs",
  "/tts-diagnostic.mjs": "tts-diagnostic.mjs",
  "/report.mjs": "report.mjs",
  "/stt-sample.mjs": "stt-sample.mjs",
  "/stt-diagnostic.mjs": "stt-diagnostic.mjs",
  "/speech-evaluation-client.mjs": "speech-evaluation-client.mjs",
  "/connection-status.mjs": "connection-status.mjs",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

class EvaluationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const json = (response, status, value) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
};

async function readJson(request, maximumBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes)
      throw new EvaluationError("Request exceeds the allowed size", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new EvaluationError("Request body must be valid JSON");
  }
}

function assertLocalBrowserRequest(request) {
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  if (
    !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    origin !== `http://${host}`
  ) {
    throw new EvaluationError(
      "Speech evaluations are only available from this local interface",
      403,
    );
  }
}

function parseEnv(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    values.set(match[1], value);
  }
  return values;
}

async function environmentValues(path) {
  let source = "";
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const values = parseEnv(source);
  for (const [name, value] of Object.entries(process.env)) {
    values.set(name, value);
  }
  return values;
}

async function configuredSecret(name, files) {
  if (process.env[name]) return process.env[name];
  for (const file of files) {
    const values = await environmentValues(file);
    if (values.get(name)) return values.get(name);
  }
  throw new Error(`Required local setting ${name} is missing`);
}

function assertLocalApiUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new EvaluationError("Enter a valid local API address");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new EvaluationError("The API address must point to localhost");
  }
  return url.origin;
}

function parseWav(wav) {
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new EvaluationError("The recording must be a valid WAV file");
  }

  let format;
  let data;
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > wav.length)
      throw new EvaluationError("The WAV file is incomplete");
    if (id === "fmt " && size >= 16) {
      format = {
        encoding: wav.readUInt16LE(start),
        channels: wav.readUInt16LE(start + 2),
        sampleRate: wav.readUInt32LE(start + 4),
        bitsPerSample: wav.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = wav.subarray(start, end);
    }
    offset = end + (size % 2);
  }
  if (
    !format ||
    !data?.length ||
    format.encoding !== 1 ||
    format.channels !== 1 ||
    format.sampleRate !== 16000 ||
    format.bitsPerSample !== 16 ||
    data.length % 2
  ) {
    throw new EvaluationError("The recording must be mono PCM16 at 16 kHz");
  }
  if (data.length < 3200 || data.length > 960000) {
    throw new EvaluationError("Record between 100 ms and 30 seconds of audio");
  }
  return data;
}

function normalizeWords(text) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function wordErrorRate(expected, actual) {
  const reference = normalizeWords(expected);
  const hypothesis = normalizeWords(actual);
  if (!reference.length)
    throw new EvaluationError("Enter a transcript containing at least one word");
  let previous = Array.from({ length: hypothesis.length + 1 }, (_, i) => i);
  for (let i = 1; i <= reference.length; i++) {
    const current = [i];
    for (let j = 1; j <= hypothesis.length; j++) {
      current.push(
        Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return {
    referenceWords: reference.length,
    recognizedWords: hypothesis.length,
    wordErrors: previous[hypothesis.length],
    wer: previous[hypothesis.length] / reference.length,
  };
}

function repairWavHeader(wav) {
  const output = Buffer.from(wav);
  if (
    output.length < 44 ||
    output.toString("ascii", 0, 4) !== "RIFF" ||
    output.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new EvaluationError("Cartesia returned an invalid WAV file", 502);
  }
  for (let offset = 12; offset + 8 <= output.length; ) {
    const id = output.toString("ascii", offset, offset + 4);
    const size = output.readUInt32LE(offset + 4);
    if (id === "data" && size === 0xffffffff) {
      output.writeUInt32LE(output.length - 8, 4);
      output.writeUInt32LE(output.length - offset - 8, offset + 4);
      return output;
    }
    if (size === 0xffffffff) break;
    offset += 8 + size + (size % 2);
  }
  return output;
}

function readProviderError(response) {
  return response.ok ? null : `Provider returned HTTP ${response.status}`;
}

async function evaluateTts(body) {
  if (
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > 220
  ) {
    throw new EvaluationError("Enter text between 1 and 220 characters");
  }
  const started = performance.now();
  let wav;
  let sampleRate;
  let model;

  if (body.model === "cartesia-sonic-3.6") {
    if (body.confirmCloudUpload !== true) {
      throw new EvaluationError(
        "Confirm the text upload to Cartesia before running this test",
      );
    }
    if (
      typeof body.voiceId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.voiceId,
      )
    ) {
      throw new EvaluationError("Enter a valid Cartesia voice ID");
    }
    const key = await configuredSecret("CARTESIA_API_KEY", [
      resolve(apiDirectory, ".env"),
    ]);
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": key,
        "Cartesia-Version": "2026-08-14",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: "sonic-3.6",
        transcript: body.text.trim(),
        voice: { id: body.voiceId },
        language: "pt",
        accent: "brazilian-portuguese",
        output_format: {
          container: "wav",
          encoding: "pcm_s16le",
          sample_rate: 24000,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const error = await readProviderError(response);
    if (error) throw new EvaluationError(`Cartesia: ${error}`, 502);
    wav = repairWavHeader(Buffer.from(await response.arrayBuffer()));
    sampleRate = 24000;
    model = "Cartesia sonic-3.6";
  } else if (body.model === "qwen-base") {
    const apiToken =
      typeof body.apiToken === "string" ? body.apiToken.trim() : "";
    if (!apiToken || apiToken.length > 512) {
      throw new EvaluationError(
        "Enter the local API access token to load the active voice profile",
      );
    }
    const apiUrl = assertLocalApiUrl(body.apiUrl);
    const profileResponse = await fetch(`${apiUrl}/v1/voice/profile`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const profileError = await readProviderError(profileResponse);
    if (profileError)
      throw new EvaluationError(
        `Could not load the active voice profile: ${profileError}`,
        502,
      );
    const { profile } = await profileResponse.json();
    if (!profile?.id || !profile.referenceFile || !profile.referenceSha256) {
      throw new EvaluationError("There is no active voice profile in the local API");
    }
    const serviceToken = await configuredSecret("TTS_SERVICE_TOKEN", [
      resolve(apiDirectory, ".env"),
      resolve(servicesDirectory, "tts/.env"),
    ]);
    const response = await fetch("http://127.0.0.1:8002/execute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        protocolVersion: "1.0",
        role: "tts",
        model: "qwen-base",
        content: body.text.trim(),
        dataClass: "local-only",
        maxTokens: 512,
        voice: {
          id: profile.id,
          referenceFile: profile.referenceFile,
          referenceSha256: profile.referenceSha256,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const serviceError = await readProviderError(response);
    if (serviceError)
      throw new EvaluationError(`Local Qwen: ${serviceError}`, 502);
    const result = await response.json();
    if (
      typeof result.audio?.pcmBase64 !== "string" ||
      result.audio.sampleRate !== 16000
    ) {
      throw new EvaluationError(
        "Local Qwen returned an unsupported audio format",
        502,
      );
    }
    const pcm = Buffer.from(result.audio.pcmBase64, "base64");
    wav = Buffer.alloc(44 + pcm.length);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + pcm.length, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24);
    wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);
    sampleRate = 16000;
    model = "Local Qwen3-TTS Base";
  } else {
    throw new EvaluationError("Choose a supported TTS model");
  }
  return {
    model,
    transcript: body.text.trim(),
    sampleRate,
    durationMs: Math.round(performance.now() - started),
    audioBase64: wav.toString("base64"),
  };
}

async function evaluateStt(body) {
  if (
    typeof body.expected !== "string" ||
    !body.expected.trim() ||
    body.expected.length > 4000 ||
    typeof body.wavBase64 !== "string" ||
    body.wavBase64.length > 1_400_000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      body.wavBase64,
    )
  ) {
    throw new EvaluationError(
      "A recording and verified reference transcript are required",
    );
  }
  const wav = Buffer.from(body.wavBase64, "base64");
  const pcm = parseWav(wav);
  const started = performance.now();
  let transcript;
  let confidence = null;

  if (body.model === "deepgram-nova-3" || body.model === "deepgram-nova-2") {
    if (body.confirmCloudUpload !== true) {
      throw new EvaluationError(
        "Confirm the upload to Deepgram before running this test",
      );
    }
    const key = await configuredSecret("DEEPGRAM_API_KEY", [
      resolve(apiDirectory, ".env"),
    ]);
    const url = new URL("https://api.deepgram.com/v1/listen");
    const deepgramModel = body.model.slice("deepgram-".length);
    url.searchParams.set("model", deepgramModel);
    url.searchParams.set("language", "pt");
    url.searchParams.set("smart_format", "true");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "audio/wav",
      },
      body: wav,
      signal: AbortSignal.timeout(90_000),
    });
    const error = await readProviderError(response);
    if (error) throw new EvaluationError(`Deepgram: ${error}`, 502);
    const result = await response.json();
    const alternative = result.results?.channels?.[0]?.alternatives?.[0];
    if (typeof alternative?.transcript !== "string") {
      throw new EvaluationError("Deepgram returned no transcription", 502);
    }
    transcript = alternative.transcript;
    confidence = alternative.confidence ?? null;
  } else if (body.model === "faster-whisper") {
    const token = await configuredSecret("STT_SERVICE_TOKEN", [
      resolve(apiDirectory, ".env"),
      resolve(servicesDirectory, "stt/.env"),
    ]);
    const response = await fetch("http://127.0.0.1:8001/execute", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        protocolVersion: "1.0",
        role: "stt",
        model: null,
        content: "",
        dataClass: "local-only",
        maxTokens: 4000,
        audio: {
          pcmBase64: pcm.toString("base64"),
          sampleRate: 16000,
          channels: 1,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const error = await readProviderError(response);
    if (error) throw new EvaluationError(`Local Whisper: ${error}`, 502);
    const result = await response.json();
    if (typeof result.content !== "string") {
      throw new EvaluationError("Local Whisper returned no transcription", 502);
    }
    transcript = result.content;
  } else {
    throw new EvaluationError("Choose a supported STT model");
  }

  return {
    model:
      body.model === "faster-whisper"
        ? "Local faster-whisper"
        : `Deepgram ${body.model.slice("deepgram-".length)}`,
    transcript,
    confidence,
    ...wordErrorRate(body.expected, transcript),
    durationMs: Math.round(performance.now() - started),
  };
}

export function createTestServer() {
  return createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );

    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      if (pathname === "/evaluation/tts" || pathname === "/evaluation/stt") {
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        assertLocalBrowserRequest(request);
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          throw new EvaluationError("Content-Type must be application/json", 415);
        }
        const body = await readJson(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new EvaluationError("Request body must be a JSON object");
        }
        const result =
          pathname === "/evaluation/tts"
            ? await evaluateTts(body)
            : await evaluateStt(body);
        json(response, 200, result);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }

      const path = pathname;
      let root = directory;
      let name = allowed[path];

      if (path.startsWith("/call-client/")) {
        root = resolve(directory, "../call-client");
        name = path.slice("/call-client/".length);
        if (!/^[a-z-]+\.(mjs|js)$/.test(name)) name = null;
      }

      if (!name) {
        response.writeHead(404).end();
        return;
      }

      const file = await realpath(resolve(root, name));
      if (!file.startsWith((await realpath(root)) + sep)) {
        response.writeHead(404).end();
        return;
      }

      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      if (pathname.startsWith("/evaluation/")) {
        const status =
          error.statusCode ??
          (error.name === "AbortError" || error.name === "TimeoutError"
            ? 504
            : error.name === "TypeError"
              ? 502
              : 500);
        json(
          response,
          status,
          { error: error.message || "Speech evaluation failed" },
        );
      } else {
        response.writeHead(404).end();
      }
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  createTestServer()
    .listen(5173, "127.0.0.1", () => {
      console.log("Teste de voz: http://127.0.0.1:5173");
    })
    .on("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? "A porta 5173 já está em uso. Encerre o servidor de teste anterior."
          : error.message,
      );
      process.exitCode = 1;
    });
}
