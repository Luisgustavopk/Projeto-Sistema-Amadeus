import { openCall } from "./connection.mjs";
import { createPlayback } from "./playback.mjs";
import { createMicrophone } from "./microphone.mjs";

// Headless integration module; the product interface remains a later phase.
export async function createCallClient(options) {
  const context = new AudioContext({ sampleRate: 48000 });
  await context.resume();
  let connection;
  try {
    connection = await openCall(options);
  } catch (error) {
    await context.close();
    throw error;
  }
  const { socket } = connection;
  let turnId = 0;
  let sequence = 0;
  let microphone;
  let disposed = false;
  let speechEndedAt = null;
  let firstAudioTurn = 0;
  const send = (event) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  };
  const playback = createPlayback(
    context,
    send,
    (error) => {
      options.onError?.(error);
      socket.close(1008, "Invalid playback");
    },
    (timing) => {
      if (speechEndedAt !== null && firstAudioTurn !== timing.turnId) {
        firstAudioTurn = timing.turnId;
        options.onTiming?.({
          stage: "firstAudioScheduled",
          turnId: timing.turnId,
          milliseconds:
            performance.now() - speechEndedAt + timing.scheduledInMs,
        });
      }
    },
  );
  const newTurn = () => {
    playback.stop(++turnId);
    send({ type: "interrupt" });
    sequence = 0;
    return turnId;
  };
  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      playback.frame(event.data);
      return;
    }
    try {
      const value = JSON.parse(event.data);
      if (value.turnId !== undefined && value.turnId !== turnId) {
        return;
      }
      if (value.type === "audio.segment") {
        playback.metadata(value);
      }
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
  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    microphone?.stop();
    playback.stop();
    await context.close();
  };
  socket.onclose = () => {
    void dispose();
    options.onEvent?.({ type: "connection.closed" });
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
    text(text) {
      microphone?.reset();
      speechEndedAt = null;
      send({ type: "text.send", turnId: newTurn(), text });
    },
    interrupt() {
      const started = performance.now();
      microphone?.reset();
      playback.stop();
      send({ type: "interrupt" });
      options.onTiming?.({
        stage: "localInterruption",
        turnId,
        milliseconds: performance.now() - started,
      });
    },
    async startMicrophone() {
      if (microphone || disposed) {
        return;
      }
      microphone = await createMicrophone(
        context,
        {
          start() {
            send({ type: "speech.start", turnId: newTurn() });
          },
          frame(pcm) {
            if (socket.readyState !== WebSocket.OPEN) {
              return;
            }
            if (socket.bufferedAmount > 65536) {
              socket.close(1008, "Capture backpressure");
              return;
            }
            const bytes = new ArrayBuffer(648);
            const view = new DataView(bytes);
            view.setUint32(0, sequence++, true);
            view.setUint32(4, turnId, true);
            for (let index = 0; index < 320; index++) {
              view.setInt16(8 + index * 2, pcm[index], true);
            }
            socket.send(bytes);
          },
          end({ silenceMs }) {
            speechEndedAt = performance.now() - silenceMs;
            send({ type: "speech.end", turnId });
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
