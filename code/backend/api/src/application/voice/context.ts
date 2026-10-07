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
  const context = buildHistoryContext(history, 3000);

  return {
    dataClass: classification,
    systemPrompt: persona,
    content:
      'Contexto recente (somente reprodução confirmada):\n' +
      JSON.stringify(context) +
      '\npartiallyPlayed indica áudio ouvido parcialmente, sem alinhamento de palavras. Não infira o trecho ouvido nem uma resposta completa a partir desse sinal. responseStatus indica conclusão, interrupção ou falha. [trecho omitido] indica resumo por limite de tamanho, não o fim original da fala.\n' +
      '\nFamiliaridade e controle de repetição (dados derivados da reprodução confirmada; variar aberturas e fechos):\n' +
      JSON.stringify(buildConversationStyle(history)) +
      (audioObservations
        ? '\nMedições acústicas, sem inferência emocional:\n' +
          JSON.stringify(audioObservations)
        : '') +
      '\nNova fala:\n' +
      JSON.stringify({ user: text }),
  };
}
