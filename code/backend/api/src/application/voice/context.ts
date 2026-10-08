import type { StoredTurn } from '../../ports/call-history-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import { buildVoicePersonaPrompt } from '../persona/voice-prompt.ts';
import { buildPersonaPrompt } from '../persona/prompt.ts';
import type { Expression } from '../../domain/persona/expression.ts';
import { buildHistoryContext } from './history-context.ts';
import { buildConversationStyle } from '../persona/conversation-style.ts';
import type { measureVoiceAudio } from './audio-observations.ts';

export function buildVoiceContext(
  history: StoredTurn[],
  text: string,
  dataClass: DataClass,
  expression?: Expression,
  audioObservations?: ReturnType<typeof measureVoiceAudio>,
  compact = false,
  retainedOwnerTurns = 0,
) {
  const classification: DataClass =
    dataClass === 'local-only' ||
    history.some((turn) => turn.dataClass === 'local-only')
      ? 'local-only'
      : dataClass === 'personal' ||
          history.some((turn) => turn.dataClass === 'personal')
        ? 'personal'
        : 'synthetic';
  const persona = compact
    ? buildVoicePersonaPrompt()
    : buildPersonaPrompt(expression);
  const context = buildHistoryContext(history, 3000, true);
  const messages = context
    .flatMap((turn) => [
      { role: 'user' as const, content: turn.user },
      ...((turn.assistantSent ?? turn.assistantConfirmed)
        ? [
            {
              role: 'assistant' as const,
              content: turn.assistantSent ?? turn.assistantConfirmed,
            },
          ]
        : []),
    ])
    .filter((message) => message.content.trim());

  const legacyContent =
    (compact
      ? 'Entrega das respostas anteriores (texto enviado não comprova leitura nem audição):\n' +
        JSON.stringify(
          context.map(({ responseStatus, partiallyPlayed }) => ({
            responseStatus,
            partiallyPlayed,
          })),
        )
      : 'Contexto recente (texto enviado e áudio confirmado são distintos):\n' +
        JSON.stringify(context)) +
    '\npartiallyPlayed indica áudio ouvido parcialmente, sem alinhamento de palavras. Não infira o trecho ouvido nem uma resposta completa a partir desse sinal. responseStatus indica conclusão, interrupção ou falha. [trecho omitido] indica resumo por limite de tamanho, não o fim original da fala.\n' +
    '\nFamiliaridade e estilo (interações disponíveis, distinguindo texto enviado de áudio confirmado; não inferir leitura ou audição; variar aberturas e fechos):\n' +
    JSON.stringify(buildConversationStyle(history, retainedOwnerTurns)) +
    (audioObservations
      ? '\nMedições acústicas, sem inferência emocional:\n' +
        JSON.stringify(audioObservations)
      : '') +
    '\nNova fala:\n' +
    JSON.stringify({ user: text });

  return {
    dataClass: classification,
    systemPrompt: persona,
    ...(compact ? { history: messages } : {}),
    content: compact ? text : legacyContent,
    conversationDirection: compact
      ? '\n<conversation_delivery>\n' +
        legacyContent.slice(0, legacyContent.lastIndexOf('\nNova fala:')) +
        '\n</conversation_delivery>'
      : '',
  };
}
