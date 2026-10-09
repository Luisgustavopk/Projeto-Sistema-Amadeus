import type { Notify } from '../types/ui';
import { useEffect, useState } from 'react';
export function useFullscreen(notify: Notify) {
  const [active, setActive] = useState(() =>
    Boolean(document.fullscreenElement),
  );
  useEffect(() => {
    const change = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Tela cheia não está disponível neste navegador.');
    }
  }
  return { active, toggle };
}
