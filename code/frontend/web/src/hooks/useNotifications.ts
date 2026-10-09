import { useCallback, useEffect, useRef, useState } from 'react';
export function useNotifications() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, notify };
}
