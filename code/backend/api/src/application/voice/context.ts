import type { StoredTurn } from '../../ports/call-history-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import { buildPersonaPrompt } from '../persona/prompt.ts';
import type { Expression } from '../../domain/persona/expression.ts';

export function buildVoiceContext(
  history: StoredTurn[],
  text: string,
  dataClass: DataClass,
  expression?: Expression,
) {
  const classification: DataClass =
    dataClass === 'local-only' ||
    history.some((turn) => turn.dataClass === 'local-only')
      ? 'local-only'
      : dataClass === 'personal' ||
          history.some((turn) => turn.dataClass === 'personal')
        ? 'personal'
        : 'synthetic';
  const persona = buildPersonaPrompt(expression);
  const context = history.slice(-12).map((turn) => ({
    user: turn.userText.slice(0, 600),
    assistantConfirmed: turn.generatedText.slice(0, 600),
  }));

  return {
    dataClass: classification,
    systemPrompt: persona,
    content:
      'Contexto recente (somente reprodução confirmada):\n' +
      JSON.stringify(context) +
      '\nNova fala:\n' +
      JSON.stringify({ user: text }),
  };
}
