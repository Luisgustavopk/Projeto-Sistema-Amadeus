export class VoiceActivityDetector {
  constructor({
    threshold = 0.025,
    silenceFrames = 15,
    preRollFrames = 8,
    startFrames = 8,
  } = {}) {
    if (!Number.isInteger(startFrames) || startFrames < 1 || startFrames > preRollFrames) throw new Error("Invalid VAD onset window");
    this.startFrames = startFrames;
    this.voicedFrames = 0;
    this.threshold = threshold;
    this.silenceFrames = silenceFrames;
    this.preRollFrames = preRollFrames;
    this.active = false;
    this.silent = 0;
    this.frames = 0;
    this.preRoll = [];
  }

  accept(frame) {
    if (!(frame instanceof Int16Array) || frame.length !== 320) {
      throw new Error("Expected 20ms PCM frame");
    }
    const rms = Math.sqrt(
      frame.reduce((sum, sample) => sum + (sample / 32768) ** 2, 0) /
        frame.length,
    );
    const voiced = rms >= this.threshold;
    if (!this.active) {
      this.preRoll.push(frame.slice());
      if (this.preRoll.length > this.preRollFrames) {
        this.preRoll.shift();
      }
      this.voicedFrames = voiced ? this.voicedFrames + 1 : 0;
      if (this.voicedFrames < this.startFrames) {
        return { start: false, frames: [], end: false };
      }
      this.voicedFrames = 0;
      this.active = true;
      this.silent = 0;
      this.frames = this.preRoll.length;
      return { start: true, frames: this.preRoll.splice(0), end: false };
    }
    this.frames++;
    this.silent = voiced ? 0 : this.silent + 1;
    const end = this.silent >= this.silenceFrames || this.frames >= 1500;
    const silenceMs = end ? this.silent * 20 : 0;
    if (end) {
      this.active = false;
      this.silent = 0;
      this.frames = 0;
    }
    return { start: false, frames: [frame], end, silenceMs };
  }
}
