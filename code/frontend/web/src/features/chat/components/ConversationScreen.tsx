import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeScreen } from '../../avatar/components/HomeScreen';
import { ExpressionsPanel } from '../../avatar/components/ExpressionsPanel';
import { ChatPanel } from './ChatPanel';
import { HistoryPanel } from '../../history/components/HistoryPanel';
import { SettingsPanel } from '../../settings/components/SettingsPanel';
import { useAuth } from '../../auth/store';
import { useSettings } from '../../settings/store';
import { useChat } from '../hooks/useChat';
import { useLive2D } from '../../avatar/hooks/useLive2D';
import { useVoicePreview } from '../../voice/hooks/useVoicePreview';
import { useDialogs } from '../../../hooks/useDialogs';
import { useFullscreen } from '../../../hooks/useFullscreen';
import { useNotice } from '../../../hooks/useNotice';
import { useI18n } from '../../../i18n/provider';
export function ConversationScreen() {
  const settings = useSettings();
  const session = useAuth();
  const notices = useNotice();
  const log = useChat();
  const avatar = useLive2D(true, settings.preferences);
  const dialogs = useDialogs();
  const fullscreen = useFullscreen(notices.notify);
  const performance = useVoicePreview({
    active: true,
    ...avatar,
    append: log.append,
    notify: notices.notify,
  });
  const micRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const t = useI18n();
  useEffect(() => {
    document.querySelector<HTMLButtonElement>('.control-rail button')?.focus();
  }, []);
  function leave() {
    performance.stop();
    dialogs.close();
    session.leave();
    navigate('/login', { replace: true });
  }
  function saveSettings() {
    const saved = settings.save();
    dialogs.close();
    notices.notify(t(saved ? 'preferencesSaved' : 'sessionOnly'));
  }
  function closeReactions() {
    dialogs.close();
    requestAnimationFrame(() => micRef.current?.focus());
  }
  const showSignalMonitor =
    document.getElementById('root')?.dataset.signalMonitor !== 'false';
  return (
    <>
      <HomeScreen
        active
        avatar={avatar}
        performance={performance}
        preferences={settings.preferences}
        onOpen={dialogs.open}
        onLeave={leave}
        fullscreen={fullscreen}
        startedAt={session.startedAt}
        micRef={micRef}
        showSignalMonitor={showSignalMonitor}
      />
      <ChatPanel
        open={dialogs.active === 'chat'}
        onClose={dialogs.close}
        log={log}
      />
      <HistoryPanel
        open={dialogs.active === 'history'}
        onClose={dialogs.close}
        log={log}
      />
      <ExpressionsPanel
        open={dialogs.active === 'avatar'}
        onClose={closeReactions}
        ready={avatar.ready}
        performance={performance}
      />
      <SettingsPanel
        open={dialogs.active === 'settings'}
        onClose={dialogs.close}
        preferences={settings.preferences}
        onChange={settings.change}
        onReset={settings.reset}
        onSave={saveSettings}
      />
    </>
  );
}
