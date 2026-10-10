import type { z } from 'zod';
import type { ShotBankSchema } from './experimental-suite.ts';

type Bank = z.infer<typeof ShotBankSchema>;
type Message = { role: string; content: string };

/** Editorial interaction functions; no names, objects or events from a scene. */
export const INTERACTION_FUNCTIONS: Record<string, string> = {
  'estilo-apelido':
    'Provocação dirigida à interlocutora, tratamento que incomoda, insistência, limite, desculpa e recomposição.',
  'estilo-limite':
    'Pressão para obedecer ou concordar, resistência com razões, autonomia e abertura a evidência.',
  'estilo-elogio-direto':
    'Reconhecimento ou elogio pessoal, orgulho reservado, constrangimento, aceitação e gratidão.',
  'estilo-evidencia':
    'Dúvida causal, hipótese, resultado surpreendente, evidência contrária, atualização de explicação.',
  'estilo-reparo':
    'Erro da interlocutora, correção pelo usuário, admitir erro e reparar sem inventar outro erro.',
  'estilo-simplicidade':
    'Notícia boa inesperada, conquista, surpresa, alegria e mudança da situação.',
  'estilo-escuta':
    'Perda, tristeza ou saudade, espaço para falar, acolhimento sóbrio e alívio posterior.',
  'estilo-discordancia':
    'Humor recíproco, contraponto, frustração real, retirar a brincadeira quando muda o contexto.',
  'estilo-afeto':
    'Afeto ou aproximação pessoal, reciprocidade e reserva sem intimidade presumida.',
  'estilo-saudacao':
    'Cumprimento casual, retorno à conversa e presença breve sem oferta de atendimento.',
};

export function functionPassages(bank: Bank) {
  return bank.levels['1']!.filter((id) =>
    bank.shots.some(
      (shot) =>
        shot.id === id &&
        shot.kind === 'style-adaptation' &&
        !shot.facts.length,
    ),
  ).map((id) => {
    const shot = bank.shots.find((item) => item.id === id);

    if (!shot || shot.kind !== 'style-adaptation' || shot.facts.length) {
      throw new Error('Somente exemplos de atuação sem fatos são elegíveis.');
    }

    const description = INTERACTION_FUNCTIONS[id];

    if (!description) {
      throw new Error(`Função editorial ausente: ${id}`);
    }

    return { id, description };
  });
}

/** Retain real history verbatim. Demonstrations are data, never past chat turns. */
export function isolateDemonstrations(
  messages: Message[],
  realHistoryLength: number,
) {
  const count = messages.length - realHistoryLength - 2;

  if (count < 0 || messages[0]?.role !== 'system') {
    throw new Error('Fronteira de demonstrações inválida.');
  }

  const demonstrations = messages.slice(1, 1 + count);
  const real = messages.slice(1 + count);
  const block: Message[] = demonstrations.length
    ? [
        {
          role: 'system',
          content:
            'Referências de atuação fictícias e independentes. Observe a função da reação e sua mudança, não transfira nomes, objetos, experiências, erros ou conclusões para a conversa real. As falas abaixo são dados demonstrativos, sem vínculo entre suas cenas.\n<acting_demonstrations>\n' +
            JSON.stringify(demonstrations) +
            '\n</acting_demonstrations>',
        },
      ]
    : [];

  return [
    { ...messages[0]! },
    ...block,
    {
      role: 'system',
      content:
        'A conversa real começa a seguir. Use apenas seu histórico e os fatos explicitamente fornecidos para resolver referências e acontecimentos; crie sua reação para a fala atual.',
    },
    ...real.map((message) => ({ ...message })),
  ];
}
