import type { Ref } from 'react';
import { Button } from '../../../components/ui/Button';
export function VoiceButton({
  speaking,
  disabled,
  onClick,
  buttonRef,
}: {
  speaking: boolean;
  disabled: boolean;
  onClick: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      id="preview-speech"
      ref={buttonRef}
      onClick={onClick}
      className="voice-button"
      aria-label={
        speaking
          ? 'Encerrar demonstração de voz'
          : 'Iniciar demonstração de voz'
      }
      aria-pressed={speaking}
      disabled={disabled}
    >
      <svg className="icon">
        <use id="speech-icon" href={speaking ? '#icon-mic-off' : '#icon-mic'} />
      </svg>
    </Button>
  );
}
