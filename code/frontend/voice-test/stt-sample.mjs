export class PcmSample {
  constructor() {
    this.frames = [];
  }
  append(frame) {
    if (!(frame instanceof Int16Array) || frame.length !== 320)
      throw new Error("Expected 20ms PCM frame");
    if (this.frames.length >= 1500)
      throw new Error("Recording exceeds 30 seconds");
    this.frames.push(frame.slice());
    return this.frames.length === 1500;
  }
  wav() {
    if (this.frames.length < 5) throw new Error("Record at least 100 ms");
    const count = this.frames.length * 320;
    const buffer = new ArrayBuffer(44 + count * 2);
    const view = new DataView(buffer);
    const label = (offset, text) => {
      for (let i = 0; i < text.length; i++)
        view.setUint8(offset + i, text.charCodeAt(i));
    };
    label(0, "RIFF");
    view.setUint32(4, 36 + count * 2, true);
    label(8, "WAVE");
    label(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    label(36, "data");
    view.setUint32(40, count * 2, true);
    let offset = 44;
    for (const frame of this.frames)
      for (const sample of frame) {
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    return buffer;
  }
}

export async function startSampleRecording(onLimit) {
  const context = new AudioContext({ sampleRate: 48000 });
  let stream, input, node, silent;
  const sample = new PcmSample();
  const cleanup = async () => {
    if (node) node.port.onmessage = null;
    input?.disconnect();
    node?.disconnect();
    silent?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") await context.close();
  };
  try {
    await context.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    await context.audioWorklet.addModule("/call-client/capture-worklet.js");
    node = new AudioWorkletNode(context, "amadeus-pcm-capture");
    input = context.createMediaStreamSource(stream);
    silent = context.createGain();
    silent.gain.value = 0;
    node.port.onmessage = (event) => {
      if (sample.append(new Int16Array(event.data))) {
        node.port.onmessage = null;
        onLimit();
      }
    };
    input.connect(node);
    node.connect(silent);
    silent.connect(context.destination);
    return {
      async stop() {
        await cleanup();
        return sample.wav();
      },
      dispose: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
