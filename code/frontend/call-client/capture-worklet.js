class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.pcm = new Int16Array(320);
    this.index = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }
    for (const sample of input) {
      this.sum += sample;
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.pcm[this.index++] = Math.round(
          Math.max(-1, Math.min(1, this.sum / this.count)) * 32767,
        );
        this.sum = 0;
        this.count = 0;
        if (this.index === 320) {
          this.port.postMessage(this.pcm.buffer, [this.pcm.buffer]);
          this.pcm = new Int16Array(320);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("amadeus-pcm-capture", PcmCaptureProcessor);
