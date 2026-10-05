import type { StoredTurn } from '../../ports/call-history-repository.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';

function boundary(text: string, tail = false) {
  const sentences = text
    .replace(/\s+/gu, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/u);

  return (tail ? sentences.at(-1) : sentences[0]) ?? '';
}

export function buildConversationStyle(history: StoredTurn[]) {
  const confirmed = history.filter((turn) => turn.generatedText.trim());
  const complete = confirmed.filter(
    (turn) =>
      !turn.partiallyPlayed &&
      (turn.responseStatus === undefined ||
        turn.responseStatus === 'completed'),
  );

  return {
    familiarity:
      complete.length >= 10 ? 'F2' : complete.length >= 3 ? 'F1' : 'F0',
    confirmedTurnsAvailable: complete.length,
    recentStyle: confirmed.slice(-5).map((turn) => ({
      opening: boundary(turn.generatedText).slice(0, 180),
      closing: boundary(turn.generatedText, true).slice(-180),
    })),
    scope:
      'available confirmed history of this conversation; not personal memory',
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

/** One normal recovery may replace a repetitive opening before any speech is sent. */
export function createConversationStyleGuard(
  history: StoredTurn[],
  userText: string,
) {
  const style = buildConversationStyle(history);
  const requestedRepetition =
    /\b(?:repete|repetir|repita|releia|cite|cita|novamente|de novo)\b/iu.test(
      userText,
    );

  return (text: string, delivered: boolean) => {
    if (delivered || requestedRepetition) {
      return;
    }

    const opening = normalize(boundary(text));
    const canned =
      /^(?:claro[!.]|otima pergunta[!.]|posso ajudar em mais algo\?|entendo como voce se sente[.!])/u.test(
        opening,
      );
    const repeated =
      opening.length >= 24 &&
      style.recentStyle.some((item) => normalize(item.opening) === opening);

    if (canned || repeated) {
      throw new ProviderInvalidError(
        'A fala começa com uma abertura automática ou já usada; reformule diretamente.',
      );
    }
  };
}
