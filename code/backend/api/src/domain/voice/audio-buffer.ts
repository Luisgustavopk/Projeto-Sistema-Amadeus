import { VoiceInputError } from '../errors/voice.ts';

export class AudioTurnBuffer {
  private readonly chunks: Uint8Array[] = [];
  private sequence = 0;
  private readonly turnId: number;
  constructor(turnId: number) {
    this.turnId = turnId;
  }

  append(frame: Uint8Array) {
    if (frame.byteLength !== 648 || this.sequence >= 1500) {
      throw new VoiceInputError(
        'Frame inválido ou fala maior que 30 segundos.',
      );
    }

    const header = new DataView(
      frame.buffer,
      frame.byteOffset,
      frame.byteLength,
    );

    if (
      header.getUint32(0, true) !== this.sequence ||
      header.getUint32(4, true) !== this.turnId
    ) {
      throw new VoiceInputError('Sequência ou turno de áudio inválido.');
    }

    this.chunks.push(frame.slice(8));
    this.sequence++;
  }

  finish() {
    if (this.sequence < 5) {
      throw new VoiceInputError('Envie pelo menos 100 ms de áudio.');
    }

    const pcm = new Uint8Array(this.chunks.length * 640);
    this.chunks.forEach((chunk, index) => pcm.set(chunk, index * 640));

    return pcm;
  }
}
