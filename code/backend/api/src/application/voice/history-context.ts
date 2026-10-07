import type { StoredTurn } from '../../ports/call-history-repository.ts';

// Character limits bound context size; they are not provider token counts.
const MAX_HISTORY_CHARACTERS = 8000;
const MAX_MESSAGE_CHARACTERS = 2000;

function excerpt(text: string, maximum = MAX_MESSAGE_CHARACTERS) {
  if (text.length <= maximum) {
    return text;
  }

  const prefix = text.slice(0, maximum);
  const boundaries = [...prefix.matchAll(/[.!?](?:\s|$)/gu)];
  const sentenceEnd = boundaries.at(-1)?.index;
  const end =
    sentenceEnd !== undefined ? sentenceEnd + 1 : prefix.lastIndexOf(' ');

  return prefix.slice(0, Math.max(0, end)).trimEnd() + ' [trecho omitido]';
}

export function buildHistoryContext(
  history: StoredTurn[],
  budget = MAX_HISTORY_CHARACTERS,
  includeSentText = false,
) {
  const selected = [];
  let characters = 0;

  for (const turn of history.slice(-12).toReversed()) {
    const entry = {
      user: excerpt(
        turn.userText,
        Math.min(MAX_MESSAGE_CHARACTERS, Math.floor(budget / 3)),
      ),
      assistantConfirmed: excerpt(
        turn.generatedText,
        Math.min(MAX_MESSAGE_CHARACTERS, Math.floor(budget / 3)),
      ),
      ...(includeSentText &&
      turn.sentText !== undefined &&
      turn.sentText !== turn.generatedText
        ? {
            assistantSent: excerpt(
              turn.sentText ?? turn.generatedText,
              Math.min(MAX_MESSAGE_CHARACTERS, Math.floor(budget / 3)),
            ),
          }
        : {}),
      responseStatus: turn.responseStatus ?? 'completed',
      ...(turn.initiativeKind ? { initiativeKind: turn.initiativeKind } : {}),
      partiallyPlayed: turn.partiallyPlayed ?? false,
    };
    const size = JSON.stringify(entry).length;

    if (characters + size > budget) {
      break;
    }

    selected.unshift(entry);
    characters += size;
  }

  return selected;
}
