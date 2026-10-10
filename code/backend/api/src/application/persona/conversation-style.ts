import type { StoredTurn } from '../../ports/call-history-repository.ts';

function boundary(text: string, tail = false) {
  const sentences = text
    .replace(/\s+/gu, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/u);

  return (tail ? sentences.at(-1) : sentences[0]) ?? '';
}

export function buildConversationStyle(
  history: StoredTurn[],
  retainedOwnerTurns = 0,
) {
  const confirmed = history.filter((turn) => turn.generatedText.trim());
  const available = history.filter((turn) =>
    (turn.sentText ?? turn.generatedText).trim(),
  );
  const complete = confirmed.filter(
    (turn) =>
      !turn.initiativeKind &&
      !turn.partiallyPlayed &&
      (turn.responseStatus === undefined ||
        turn.responseStatus === 'completed'),
  );

  const completedTextTurns = available.filter(
    (turn) =>
      !turn.initiativeKind &&
      !turn.partiallyPlayed &&
      (turn.responseStatus === undefined ||
        turn.responseStatus === 'completed'),
  );
  const familiarTurns = Math.max(completedTextTurns.length, retainedOwnerTurns);

  return {
    familiarity: familiarTurns >= 10 ? 'F2' : familiarTurns >= 3 ? 'F1' : 'F0',
    confirmedTurnsAvailable: complete.length,
    completedTextTurnsAvailable: completedTextTurns.length,
    ...(retainedOwnerTurns ? { retainedOwnerTurns } : {}),
    recentStyle: available.slice(-5).map((turn) => ({
      opening: boundary(turn.sentText ?? turn.generatedText).slice(0, 180),
      closing: boundary(turn.sentText ?? turn.generatedText, true).slice(-180),
      evidence: turn.sentText !== undefined ? 'sent-text' : 'confirmed-audio',
      responseStatus: turn.responseStatus ?? 'completed',
    })),
    scope: retainedOwnerTurns
      ? 'eligible retained interactions of this owner; not proof of intimacy or hearing'
      : 'available interactions of this conversation; not proof of reading, hearing or intimacy; not personal memory',
  };
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Style is feedback, never a format error or a reason to regenerate speech. */
export function createConversationStyleObserver(history: StoredTurn[]) {
  const style = buildConversationStyle(history);

  return (text: string, delivered: boolean) => {
    const opening = normalize(boundary(text));
    const repeated =
      opening.length >= 24 &&
      style.recentStyle.some((item) => normalize(item.opening) === opening);

    return { repeatedOpening: repeated, alreadyDelivered: delivered };
  };
}
