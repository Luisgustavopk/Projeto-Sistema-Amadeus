import { ApplicationError } from './application-error.ts';

export class VoiceInputError extends ApplicationError {
  constructor(message = 'Entrada de voz inválida.') {
    super('VOICE_INPUT_INVALID', message);
  }
}
export class VoiceNotReadyError extends ApplicationError {
  constructor(
    message = 'Configure uma referência vocal autorizada e os provedores.',
  ) {
    super('VOICE_NOT_READY', message);
  }
}

export class NoSpeechDetectedError extends ApplicationError {
  constructor() {
    super('NO_SPEECH_DETECTED', 'Nenhuma fala reconhecida no áudio.');
  }
}
