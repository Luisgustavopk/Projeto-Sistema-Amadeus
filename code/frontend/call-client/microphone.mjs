import { VoiceActivityDetector } from "./vad.mjs";

export async function createMicrophone(context, handlers, vadOptions) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  try {
    await context.audioWorklet.addModule(
      new URL("./capture-worklet.js", import.meta.url),
    );
    const node = new AudioWorkletNode(context, "amadeus-pcm-capture");
    const input = context.createMediaStreamSource(stream);
    const silent = context.createGain();
    silent.gain.value = 0;
    let vad = new VoiceActivityDetector(vadOptions);
    node.port.onmessage = (event) => {
      const activity = vad.accept(new Int16Array(event.data));
      if (activity.start) {
        handlers.start();
      }
      for (const frame of activity.frames) {
        handlers.frame(frame);
      }
      if (activity.end) {
        handlers.end({ silenceMs: activity.silenceMs });
      }
    };
    input.connect(node);
    node.connect(silent);
    silent.connect(context.destination);
    return {
      reset() {
        vad = new VoiceActivityDetector(vadOptions);
      },
      stop() {
        node.port.onmessage = null;
        input.disconnect();
        node.disconnect();
        silent.disconnect();
        stream.getTracks().forEach((track) => track.stop());
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}
