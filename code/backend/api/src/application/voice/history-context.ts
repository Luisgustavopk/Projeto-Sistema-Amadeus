import type { StoredTurn } from '../../ports/call-history-repository.ts';

// Character limits bound context size; they are not provider token counts.
const MAX_HISTORY_CHARACTERS = 8000;
const MAX_MESSAGE_CHARACTERS = 2000;

function excerpt(text: string) {
  if (text.length <= MAX_MESSAGE_CHARACTERS) {
    return text;
  }

  const prefix = text.slice(0, MAX_MESSAGE_CHARACTERS);
  const boundaries = [...prefix.matchAll(/[.!?](?:\s|$)/gu)];
  const sentenceEnd = boundaries.at(-1)?.index;
  const end =
    sentenceEnd !== undefined ? sentenceEnd + 1 : prefix.lastIndexOf(' ');

  return prefix.slice(0, Math.max(0, end)).trimEnd() + ' [trecho omitido]';
}

export function buildHistoryContext(history: StoredTurn[]) {
  const selected = [];
  let characters = 0;

  for (const turn of history.slice(-12).toReversed()) {
    const entry = {
      user: excerpt(turn.userText),
      assistantConfirmed: excerpt(turn.generatedText),
      responseStatus: turn.responseStatus ?? 'completed',
      partiallyPlayed: turn.partiallyPlayed ?? false,
    };
    const size = JSON.stringify(entry).length;

    if (characters + size > MAX_HISTORY_CHARACTERS) {
      break;
    }

    selected.unshift(entry);
    characters += size;
  }

  return selected;
}
