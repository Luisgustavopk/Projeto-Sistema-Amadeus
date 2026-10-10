import { randomUUID } from 'node:crypto';

export type PresenceKind = 'greeting' | 'initiative';

/** Offers reserve no inference. Client acceptance arbitrates the shared turn IDs. */
export function createPresenceController(input: {
  busy: () => boolean;
  offer: (id: string, kind: PresenceKind) => void;
  resumed?: boolean;
  greetingDelayMs?: number;
  silenceMs?: number;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  let enabled = false,
    available = false,
    closed = false,
    greeted = Boolean(input.resumed);
  let userActivity = 0,
    offeredForActivity = -1,
    initiatives = 0;
  let lastActivity = now(),
    lastOffer = -Infinity;
  let pending: { id: string; kind: PresenceKind; expiresAt: number } | null =
    null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const silence = Math.max(30000, input.silenceMs ?? 90000);
  const delay = Math.max(0, input.greetingDelayMs ?? 1500);

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
  }

  function schedule() {
    clearTimeout(timer);

    if (closed || !enabled || !available || input.busy() || pending) {
      return;
    }

    if (
      greeted &&
      (!userActivity || initiatives >= 2 || offeredForActivity === userActivity)
    ) {
      return;
    }

    const wait = greeted
      ? Math.max(
          silence - (now() - lastActivity),
          180000 - (now() - lastOffer),
          0,
        )
      : delay;
    timer = setTimeout(() => {
      timer = undefined;

      if (closed || !enabled || !available || input.busy()) {
        return;
      }

      const kind: PresenceKind = greeted ? 'initiative' : 'greeting';
      pending = { id: randomUUID(), kind, expiresAt: now() + 10000 };
      lastOffer = now();

      if (kind === 'greeting') {
        greeted = true;
      } else {
        initiatives++;
        offeredForActivity = userActivity;
      }

      input.offer(pending.id, kind);
      timer = setTimeout(() => {
        pending = null;
        schedule();
      }, 10000);
      timer.unref?.();
    }, wait);
    timer.unref?.();
  }

  return {
    update(value: { enabled: boolean; available: boolean }) {
      enabled = value.enabled;
      available = value.available;

      if (!enabled || !available) {
        cancel();
      }

      schedule();
    },
    activity(user = false) {
      cancel();
      lastActivity = now();

      if (user) {
        userActivity++;
        greeted = true;
      }

      schedule();
    },
    idle() {
      lastActivity = now();
      schedule();
    },
    consume(id: string) {
      const offer = pending;

      if (offer?.id !== id) {
        return null;
      }

      cancel();

      if (
        !offer ||
        offer.id !== id ||
        now() > offer.expiresAt ||
        !enabled ||
        !available ||
        closed ||
        input.busy()
      ) {
        return null;
      }

      return offer.kind;
    },
    decline(id: string) {
      if (pending?.id === id) {
        cancel();
        schedule();
      }
    },
    pauseAfterFailure() {
      enabled = false;
      cancel();
    },
    close() {
      closed = true;
      cancel();
    },
  };
}
