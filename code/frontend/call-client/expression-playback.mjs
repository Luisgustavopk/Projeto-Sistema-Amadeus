// A result belongs to one segment, never to the next sentence or turn.
export function createExpressionPlayback(onExpression) {
  const proposals = new Map();
  const retired = new Set();
  let active = null;
  let lastSegment = null;
  let emitted = null;
  let turnId = 0;
  const key = (event) => `${event.responseId}:${event.segmentId}`;
  const apply = () => {
    const proposal = active && proposals.get(active);
    if (proposal && proposal !== emitted) {
      emitted = proposal;
      onExpression?.(proposal);
    }
  };
  return {
    receive(event) {
      if (event.turnId !== turnId || retired.has(key(event))) return;
      proposals.set(key(event), event);
      if (proposals.size > 48) proposals.delete(proposals.keys().next().value);
      apply();
    },
    playing(segment) {
      const next = segment ? key(segment) : null;
      if (active !== next) {
        if (next && lastSegment && lastSegment !== next) {
          retired.add(lastSegment);
          proposals.delete(lastSegment);
        }
        if (next) lastSegment = next;
        active = next;
        emitted = null;
        onExpression?.(null);
      }
      apply();
    },
    reset(nextTurn = turnId) {
      turnId = nextTurn;
      proposals.clear();
      retired.clear();
      active = null;
      lastSegment = null;
      emitted = null;
      onExpression?.(null);
    },
  };
}
