import { SESSION_LIMITS } from '../protocol/limits.ts';

export function createSessionLifecycle(
  close: (code: number, reason: string) => void,
) {
  let events = 0;
  const negotiation = setTimeout(
    () => close(1008, 'Negotiation timeout'),
    SESSION_LIMITS.negotiationDeadlineMs,
  );
  const lifetime = setTimeout(
    () => close(1000, 'Foundation connection expired'),
    SESSION_LIMITS.connectionTtlMs,
  );
  const reset = setInterval(() => {
    events = 0;
  }, 60000);

  negotiation.unref();
  lifetime.unref();
  reset.unref();

  return {
    allowEvent() {
      return ++events <= SESSION_LIMITS.maximumEventsPerMinute;
    },
    negotiated() {
      clearTimeout(negotiation);
    },
    dispose() {
      clearTimeout(negotiation);
      clearTimeout(lifetime);
      clearInterval(reset);
    },
  };
}
