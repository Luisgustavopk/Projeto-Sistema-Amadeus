import type { Ref } from 'react';
import type { AvatarController, VoicePreview } from '../types';
import type { Preferences } from '../../settings/preferences';
import type { OpenPanel } from '../../../types/ui';
import type { useFullscreen } from '../../../hooks/useFullscreen';
import { StageBackdrop } from './StageBackdrop';
import { CornerFrame } from '../../../components/hud/CornerFrame';
import { Scanlines } from '../../../components/hud/Scanlines';
import { Live2DStage } from './Live2DStage';
import { Header } from '../../../components/hud/Header';
import { SideRail } from '../../../components/hud/SideRail';
import { ConversationDock } from '../../voice/components/ConversationDock';
import { Telemetry } from '../../../components/hud/Telemetry';
import { Footer } from '../../../components/hud/Footer';
export function HomeScreen({
  active,
  avatar,
  performance,
  preferences,
  onOpen,
  onLeave,
  fullscreen,
  startedAt,
  micRef,
  showSignalMonitor = true,
}: {
  active: boolean;
  avatar: AvatarController;
  performance: VoicePreview;
  preferences: Preferences;
  onOpen: OpenPanel;
  onLeave: () => void;
  fullscreen: ReturnType<typeof useFullscreen>;
  startedAt: number;
  micRef: Ref<HTMLButtonElement>;
  showSignalMonitor?: boolean;
}) {
  return (
    <main
      id="home"
      className="home"
      hidden={!active}
      data-speaking={String(performance.speaking)}
      aria-label="Interface Amadeus"
    >
      <StageBackdrop />
      <div className="laboratory-grid" aria-hidden="true"></div>
      <CornerFrame />
      <Live2DStage avatar={avatar} />
      <div className="screen-vignette" aria-hidden="true"></div>
      <Scanlines />

      <Header status={avatar.status.state} onOpen={onOpen} />

      {showSignalMonitor && (
        <Telemetry
          status={avatar.status.state}
          reaction={performance.selected.label}
        />
      )}

      <SideRail onOpen={onOpen} onLeave={onLeave} fullscreen={fullscreen} />

      <ConversationDock
        performance={performance}
        ready={avatar.ready}
        subtitles={preferences.subtitles}
        micRef={micRef}
      />
      <Footer startedAt={startedAt} onOpen={onOpen} />
    </main>
  );
}
