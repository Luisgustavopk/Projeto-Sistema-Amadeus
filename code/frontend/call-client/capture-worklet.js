import { createPcmResampler } from "./pcm-resampler.mjs";

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pcm = new Int16Array(320);
    this.index = 0;
    this.resample = createPcmResampler(sampleRate, (sample) => {
      this.pcm[this.index++] = sample;
      if (this.index === 320) {
        this.port.postMessage(this.pcm.buffer, [this.pcm.buffer]);
        this.pcm = new Int16Array(320);
        this.index = 0;
      }
    });
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }
    this.resample(input);
    return true;
  }
}
registerProcessor("amadeus-pcm-capture", PcmCaptureProcessor);
