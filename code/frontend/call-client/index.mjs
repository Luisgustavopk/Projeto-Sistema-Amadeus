import { openCall } from "./connection.mjs";
import { createPlayback } from "./playback.mjs";
import { createMicrophone } from "./microphone.mjs";
import { createVoiceTimings } from "./voice-timings.mjs";

// Headless integration module; the product interface remains a later phase.
export async function createCallClient(options, runtime = {}) {
  const AudioContext = runtime.AudioContext ?? globalThis.AudioContext;
  const connect = runtime.openCall ?? openCall;
  const makePlayback = runtime.createPlayback ?? createPlayback;
  const makeMicrophone = runtime.createMicrophone ?? createMicrophone;
  const now = runtime.now ?? (() => performance.now());
  const context = new AudioContext({ sampleRate: 48000 });
  await context.resume();

  const ensureAudioRunning = async () => {
    if (context.state !== "running") {
      let timeout;
      try {
        await Promise.race([
          context.resume(),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Audio resume timeout")),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
    if (context.state !== "running") {
      throw new Error("Browser audio output is not running");
    }
  };

  let connection;
  try {
    connection = await connect(options);
  } catch (error) {
    await context.close();
    throw error;
  }
  const { socket } = connection;
  let audioFrameQueue = Promise.resolve();
  let audioResumeFailed = false;
  let queuedMessages = 0;
  let queuedBytes = 0;
  let turnId = 0;
  let turnSequence = 0;
  let captureTurnId = null;
  let captureSequence = 0;
  let recognizingTurnId = null;
  let microphone;
  let disposed = false;
  let lastSequence = -1;
  const timings = createVoiceTimings(now, options.onTiming);
  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  };
  const playback = makePlayback(
    context,
    send,
    (error) => {
      options.onError?.(error);
      socket.close(1008, "Invalid playback");
    },
    (timing) => timings.firstAudio(timing),
  );
  const newTurn = () => {
    turnId = ++turnSequence;
    playback.stop(turnId);
    send({ type: "interrupt" });
    return turnId;
  };
  const receiveControl = (data) => {
    try {
      const value = JSON.parse(data);
      if (Number.isInteger(value.seq)) {
        lastSequence = Math.max(lastSequence, value.seq);
      }
      if (value.type === "transcript.partial") {
        if (
          value.turnId !== (captureTurnId ?? recognizingTurnId) ||
          typeof value.text !== "string" ||
          !/[\p{L}\p{N}]/u.test(value.text)
        )
          return;
        const wasPlaying = playback.isPlaying();
        turnId = value.turnId;
        playback.stop(turnId);
        timings.confirm(turnId, wasPlaying);
      } else if (value.type === "transcript.final") {
        if (
          value.turnId !== recognizingTurnId ||
          typeof value.text !== "string" ||
          !value.text.trim()
        ) {
          return;
        }
        const wasPlaying = playback.isPlaying();
        turnId = value.turnId;
        playback.stop(turnId);
        timings.confirm(turnId, wasPlaying);
        recognizingTurnId = null;
      } else if (value.type === "error" && value.turnId === recognizingTurnId) {
        timings.discard(recognizingTurnId);
        recognizingTurnId = null;
        options.onEvent?.(value);
        return;
      }
      if (value.turnId !== undefined && value.turnId !== turnId) {
        return;
      }
      if (value.type === "audio.segment") {
        playback.metadata(value);
      }
      if (value.type === "audio.start") playback.startStream(value);
      if (value.type === "audio.end") playback.endStream(value);
      if (value.type === "audio.abort") playback.abortStream(value);
      if (value.type === "reply.done") {
        playback.done(value.responseId);
      }
      if (value.type === "interrupted") {
        playback.stop();
      }
      options.onEvent?.(value);
    } catch (error) {
      options.onError?.(error);
    }
  };
  const receive = async (data) => {
    if (disposed || socket.readyState !== WebSocket.OPEN) return;
    if (data instanceof ArrayBuffer) {
      if (context.state !== "running") await ensureAudioRunning();
      if (!disposed && socket.readyState === WebSocket.OPEN)
        playback.frame(data);
    } else {
      receiveControl(data);
    }
  };
  const outputFailed = (error) => {
    if (audioResumeFailed || disposed) return;
    audioResumeFailed = true;
    options.onError?.(
      new Error(
        "Não foi possível retomar a saída de áudio do navegador. Reconecte a chamada e tente novamente.",
        { cause: error },
      ),
    );
    socket.close(1008, "Audio output unavailable");
  };
  socket.onmessage = ({ data }) => {
    // Metadata and PCM must share the queue while resume() is pending.
    // A new frame must not overtake an older frame after the context resumes.
    if (
      queuedMessages ||
      (data instanceof ArrayBuffer && context.state !== "running")
    ) {
      const size =
        data instanceof ArrayBuffer ? data.byteLength : data.length * 2;
      if (queuedBytes + size > 4 * 1024 * 1024) {
        options.onError?.(
          new Error(
            "A fila de áudio do navegador excedeu o limite. Reconecte a chamada.",
          ),
        );
        socket.close(1008, "Receive backpressure");
        return;
      }
      queuedMessages++;
      queuedBytes += size;
      audioFrameQueue = audioFrameQueue
        .then(() => receive(data))
        .catch(outputFailed)
        .finally(() => {
          queuedMessages--;
          queuedBytes -= size;
        });
    } else {
      void receive(data).catch(outputFailed);
    }
  };
  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    microphone?.stop();
    playback.stop();
    timings.clear();
    await context.close();
  };
  socket.onclose = (event) => {
    void dispose();
    options.onEvent?.({
      type: "connection.closed",
      code: event?.code ?? 1006,
      reason: event?.reason ?? "",
      wasClean: event?.wasClean ?? false,
    });
  };
  socket.onerror = () => options.onError?.(new Error("WebSocket failed"));
  const heartbeat = setInterval(
    () => send({ type: "ping", id: String(Date.now()) }),
    20000,
  );
  socket.addEventListener("close", () => clearInterval(heartbeat), {
    once: true,
  });
  return {
    ...connection,
    resumeState() {
      return {
        conversationId: connection.conversationId,
        resume: {
          previousSessionId: connection.session?.sessionId,
          lastSeq: lastSequence,
        },
      };
    },
    text(text) {
      microphone?.reset();
      captureTurnId = null;
      recognizingTurnId = null;
      timings.clear();
      send({ type: "text.send", turnId: newTurn(), text });
    },
    interrupt() {
      const started = now();
      microphone?.reset();
      captureTurnId = null;
      recognizingTurnId = null;
      timings.clear();
      playback.stop();
      send({ type: "interrupt" });
      options.onTiming?.({
        stage: "localInterruption",
        turnId,
        milliseconds: now() - started,
      });
    },
    async startMicrophone() {
      if (microphone || disposed) {
        return;
      }
      await ensureAudioRunning();
      microphone = await makeMicrophone(
        context,
        {
          start() {
            captureTurnId = ++turnSequence;
            timings.start(captureTurnId);
            captureSequence = 0;
            send({ type: "speech.start", turnId: captureTurnId });
          },
          frame(pcm) {
            if (
              socket.readyState !== WebSocket.OPEN ||
              captureTurnId === null
            ) {
              return;
            }
            if (socket.bufferedAmount > 65536) {
              socket.close(1008, "Capture backpressure");
              return;
            }
            const bytes = new ArrayBuffer(648);
            const view = new DataView(bytes);
            view.setUint32(0, captureSequence++, true);
            view.setUint32(4, captureTurnId, true);
            for (let index = 0; index < 320; index++) {
              view.setInt16(8 + index * 2, pcm[index], true);
            }
            socket.send(bytes);
          },
          end({ silenceMs }) {
            if (captureTurnId !== null) {
              timings.end(captureTurnId, silenceMs);
              recognizingTurnId = captureTurnId;
              send({ type: "speech.end", turnId: captureTurnId });
              captureTurnId = null;
            }
          },
        },
        options.vad,
      );
      if (disposed) {
        microphone.stop();
        microphone = null;
      }
    },
    stopMicrophone() {
      microphone?.stop();
      microphone = null;
      captureTurnId = null;
      recognizingTurnId = null;
      timings.clear();
      playback.stop();
      send({ type: "interrupt" });
    },
    async close() {
      send({ type: "session.end" });
      await dispose();
      const timeout = setTimeout(() => socket.close(), 2000);
      socket.addEventListener("close", () => clearTimeout(timeout), {
        once: true,
      });
    },
  };
}
