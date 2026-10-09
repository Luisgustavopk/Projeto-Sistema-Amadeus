import { useEffect, useRef } from 'react';
import {
  createVisualEffects,
  type BackdropRuntime,
} from '../lib/visual-effects.mjs';
export function useBackdrop(screen: 'welcome' | 'home', effects: boolean) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<BackdropRuntime | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const visual = createVisualEffects({ canvas: canvas.current, screen });
    runtime.current = visual;
    const suspend = () => visual.suspend();
    const resume = () => visual.resume();
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
      visual.destroy();
      runtime.current = null;
    };
  }, [screen]);
  useEffect(() => runtime.current?.configure({ effects }), [effects]);
  return canvas;
}
