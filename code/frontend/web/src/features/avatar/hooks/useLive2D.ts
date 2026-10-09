import type { AvatarRuntime, AvatarStatus } from '../types';
import type { Preferences } from '../../settings/preferences';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createAvatar } from '../runtime/avatar.mjs';

export function useLive2D(active: boolean, preferences: Preferences) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<AvatarRuntime | null>(null);
  const [status, setStatus] = useState<AvatarStatus>({ state: 'loading' });
  useEffect(() => {
    if (!canvasRef.current || !hostRef.current) return;
    let mounted = true;
    const avatar = createAvatar({
      canvas: canvasRef.current,
      host: hostRef.current,
      onStatus: (value) => {
        if (mounted) setStatus(value);
      },
    });
    runtime.current = avatar;
    return () => {
      mounted = false;
      runtime.current = null;
      avatar.destroy();
    };
  }, []);
  useEffect(() => {
    runtime.current?.configure({
      zoom: preferences.zoom,
      tracking: preferences.tracking,
    });
  }, [preferences.zoom, preferences.tracking]);
  useEffect(() => {
    const avatar = runtime.current;
    if (!avatar) return;
    avatar.setActive(active);
    if (active) void avatar.load();
    const suspend = () => avatar.setActive(false);
    const resume = () => avatar.setActive(active);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
    };
  }, [active]);
  const retry = useCallback(() => {
    void runtime.current?.load();
  }, []);
  const expression = useCallback(
    (name: string | null) =>
      runtime.current?.expression(name) ?? Promise.resolve(false),
    [],
  );
  const speak = useCallback(
    (duration: number) => runtime.current?.speak(duration),
    [],
  );
  const stopSpeaking = useCallback(() => runtime.current?.stopSpeaking(), []);
  return {
    canvasRef,
    hostRef,
    status,
    ready: status.state === 'ready',
    retry,
    expression,
    speak,
    stopSpeaking,
  };
}
