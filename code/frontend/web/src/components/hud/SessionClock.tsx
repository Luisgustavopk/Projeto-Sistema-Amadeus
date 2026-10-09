import { formatSessionTime } from '../../lib/utils';
import { useEffect, useState } from 'react';
export function SessionClock({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () =>
      setSeconds(startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return (
    <time id="session-time">
      {formatSessionTime(seconds)}:{String(seconds % 60).padStart(2, '0')}
    </time>
  );
}
