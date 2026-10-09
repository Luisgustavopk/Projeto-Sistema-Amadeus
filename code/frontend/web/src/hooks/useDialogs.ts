import type { DialogName } from '../types/ui';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
export function useDialogs() {
  const [active, setActive] = useState<DialogName | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((name: DialogName) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setActive(name);
  }, []);
  const close = useCallback(() => setActive(null), []);
  useLayoutEffect(() => {
    if (!active && opener.current?.isConnected) {
      opener.current.focus();
      opener.current = null;
    }
  }, [active]);
  return { active, open, close };
}
