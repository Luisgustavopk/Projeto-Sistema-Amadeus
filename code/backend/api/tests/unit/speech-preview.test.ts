import { expect, it, vi } from 'vitest';
import { createSpeechPreview } from '../../src/application/voice/speech-preview.ts';
import { AudioTurnBuffer } from '../../src/domain/voice/audio-buffer.ts';

function append(buffer: AudioTurnBuffer, turnId: number, count: number) {
  for (let index = 0; index < count; index++) {
    const frame = Buffer.alloc(648);
    frame.writeUInt32LE(buffer.frameCount, 0);
    frame.writeUInt32LE(turnId, 4);
    buffer.append(frame);
  }
}

it('reconhece uma palavra durante a captura sem esperar speech.end', async () => {
  const confirmed = vi.fn();
  const transcribe = vi.fn(async () => 'Espera');
  const preview = createSpeechPreview({
    enabled: () => true,
    transcribe,
    confirmed,
  });
  const audio = new AudioTurnBuffer(1);
  preview.start(1);
  append(audio, 1, 39);
  preview.append(audio);
  expect(transcribe).not.toHaveBeenCalled();
  append(audio, 1, 1);
  preview.append(audio);
  await vi.waitFor(() => expect(confirmed).toHaveBeenCalledWith(1, 'Espera'));
  append(audio, 1, 40);
  preview.append(audio);
  expect(transcribe).toHaveBeenCalledOnce();
  expect(audio.finish()).toHaveLength(80 * 640);
  await preview.close();
});

it('som, pontuação ou falha não confirmam interrupção e não criam fila', async () => {
  const confirmed = vi.fn();
  const transcribe = vi
    .fn()
    .mockResolvedValueOnce('...')
    .mockRejectedValueOnce(new Error())
    .mockResolvedValue('Olá');
  const preview = createSpeechPreview({
    enabled: () => true,
    transcribe,
    confirmed,
  });
  const audio = new AudioTurnBuffer(1);
  preview.start(1);

  for (let attempt = 0; attempt < 3; attempt++) {
    append(audio, 1, 40);
    preview.append(audio);
    preview.append(audio);
    await vi.waitFor(() =>
      expect(transcribe).toHaveBeenCalledTimes(attempt + 1),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (attempt < 2) {
      expect(confirmed).not.toHaveBeenCalled();
    }
  }

  expect(confirmed).toHaveBeenCalledOnce();
  await preview.close();
});

it('descarta reconhecimento atrasado de uma captura cancelada', async () => {
  let resolve: (value: string) => void = () => {};

  const confirmed = vi.fn();
  const preview = createSpeechPreview({
    enabled: () => true,
    confirmed,
    transcribe: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  });
  const audio = new AudioTurnBuffer(1);
  preview.start(1);
  append(audio, 1, 40);
  preview.append(audio);
  preview.start(2);
  resolve('Antiga');
  await preview.close();
  expect(confirmed).not.toHaveBeenCalled();
});

it('não consulta o STT antecipadamente quando não há resposta ativa', async () => {
  const transcribe = vi.fn(async () => 'Olá');
  const preview = createSpeechPreview({
    enabled: () => false,
    transcribe,
    confirmed: vi.fn(),
  });
  const audio = new AudioTurnBuffer(1);
  preview.start(1);
  append(audio, 1, 100);
  preview.append(audio);
  expect(transcribe).not.toHaveBeenCalled();
  await preview.close();
});
