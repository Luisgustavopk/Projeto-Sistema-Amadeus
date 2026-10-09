import type { Ref } from 'react';
import type { VoicePreview } from '../../avatar/types';
import { Subtitle } from './Subtitle';
import { VoiceLine } from './VoiceLines';
import { VoiceButton } from './VoiceButton';
export function ConversationDock({
  performance,
  ready,
  subtitles,
  micRef,
}: {
  performance: VoicePreview;
  ready: boolean;
  subtitles: boolean;
  micRef: Ref<HTMLButtonElement>;
}) {
  return (
    <section className="conversation-dock" aria-label="Prévia da fala">
      <p className="speaker-label">KURISU MAKISE</p>
      <Subtitle visible={subtitles} text={performance.selected.text} />
      <div className="voice-controls">
        <VoiceLine />
        <VoiceButton
          speaking={performance.speaking}
          disabled={!ready || performance.pending}
          onClick={performance.toggleSpeech}
          buttonRef={micRef}
        />
        <VoiceLine />
      </div>
      <p id="preview-caption" className="dock-caption mono">
        {performance.speaking
          ? 'MOVIMENTO DE FALA · DEMONSTRAÇÃO'
          : 'PRÉVIA VISUAL · SEM ÁUDIO'}
      </p>
    </section>
  );
}
