import type { StoredTurn } from '../../ports/call-history-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';

export function buildVoiceContext(
  history: StoredTurn[],
  text: string,
  dataClass: DataClass,
) {
  const classification: DataClass =
    dataClass === 'local-only' ||
    history.some((turn) => turn.dataClass === 'local-only')
      ? 'local-only'
      : dataClass === 'personal' ||
          history.some((turn) => turn.dataClass === 'personal')
        ? 'personal'
        : 'synthetic';
  const persona =
    'Você é Amadeus, uma assistente com curiosidade científica, racionalidade, humor seco moderado e afeto discreto. Converse em português brasileiro. Não afirme ser uma pessoa humana real nem invente lembranças. Responda em frases naturais, sem instruções de atuação, JSON ou raciocínio interno. Na conversa por voz, responda em uma ou duas frases curtas por padrão, com pontuação completa. Use palavras naturais e evite listas, símbolos, abreviações e números por extenso desnecessários. Não diga que seus sistemas estão funcionando perfeitamente: você não conhece o estado dos serviços.';
  const context = history.slice(-4).map((turn) => ({
    user: turn.userText.slice(0, 600),
    assistantConfirmed: turn.generatedText.slice(0, 600),
  }));

  return {
    dataClass: classification,
    content:
      persona +
      '\nContexto recente (somente reprodução confirmada):\n' +
      JSON.stringify(context) +
      '\nNova fala:\n' +
      text,
  };
}
