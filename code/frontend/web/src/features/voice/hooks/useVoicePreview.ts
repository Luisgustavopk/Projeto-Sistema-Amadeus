import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REACTIONS,
  previewDuration,
  type ReactionKey,
} from '../../avatar/expressions';
import { useAvatarStore } from '../../avatar/store';
import type { AvatarController } from '../../avatar/types';
import type { MessageRole } from '../../chat/types';
import type { Notify } from '../../../types/ui';

export function useVoicePreview({
  active,
  ready,
  expression,
  speak,
  stopSpeaking,
  append,
  notify,
}: Pick<AvatarController, 'ready' | 'expression' | 'speak' | 'stopSpeaking'> & {
  active: boolean;
  append: (role: MessageRole, text: string) => void;
  notify: Notify;
}) {
  const { reaction, setReaction } = useAvatarStore();
  const [speaking, setSpeaking] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const stop = useCallback(() => {
    revision.current++;
    clearTimeout(timer.current);
    stopSpeaking();
    setSpeaking(false);
  }, [stopSpeaking]);
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stop);
    return () => {
      mounted.current = false;
      revision.current++;
      clearTimeout(timer.current);
      stopSpeaking();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', stop);
    };
  }, [stop, stopSpeaking]);
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
  useEffect(() => {
    // Reapply the selected face after the route mounts a fresh rig.
    if (ready) void expression(REACTIONS[reaction].expression);
  }, [ready, reaction, expression]);
  async function select(key: ReactionKey) {
    if (busy.current || !ready) return false;
    busy.current = true;
    setPending(true);
    stop();
    const request = revision.current;
    try {
      const success = await expression(REACTIONS[key].expression);
      if (!mounted.current || request !== revision.current) return false;
      if (!success) {
        notify('Expressão indisponível neste modelo.');
        return false;
      }
      setReaction(key);
      return true;
    } catch {
      if (mounted.current) notify('Não foi possível carregar essa expressão.');
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function toggleSpeech() {
    if (speaking) {
      stop();
      return;
    }
    if (!ready || busy.current || !active) return;
    busy.current = true;
    setPending(true);
    const request = ++revision.current;
    try {
      const selected = REACTIONS[reaction];
      if (
        !(await expression(selected.expression)) ||
        !mounted.current ||
        request !== revision.current
      )
        return;
      append('preview', selected.text);
      setSpeaking(true);
      const duration = previewDuration(selected.text);
      speak(duration);
      timer.current = setTimeout(stop, duration);
    } catch {
      if (mounted.current)
        notify('Não foi possível reproduzir essa expressão.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return {
    reaction,
    selected: REACTIONS[reaction],
    speaking,
    pending,
    select,
    toggleSpeech,
    stop,
  };
}
