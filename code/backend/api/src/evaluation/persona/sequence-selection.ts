type FunctionReference = { id: string; description: string };

/** Multilingual embeddings decide relevance; no keyword or identity rules. */
export function rankInteractionFunctions(
  references: FunctionReference[],
  vectors: number[][],
  current: number[],
  previousUsers?: number[],
) {
  if (references.length !== vectors.length || !current.length) {
    throw new Error('Índice de funções incompatível.');
  }

  const dot = (left: number[], right: number[]) => {
    if (left.length !== right.length) {
      throw new Error('Dimensão vetorial incompatível.');
    }

    return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
  };

  return references
    .map((reference, index) => ({
      id: reference.id,
      relevance:
        dot(current, vectors[index]!) * (previousUsers ? 0.85 : 1) +
        (previousUsers ? dot(previousUsers, vectors[index]!) * 0.15 : 0),
    }))
    .sort((left, right) => right.relevance - left.relevance);
}

/** Each source scene remains a separate data object outside actual history. */
export function groupedActingMessages(input: {
  system: string;
  examples: {
    id: string;
    description: string;
    messages: { role: string; content: string }[];
  }[];
  history: { role: string; content: string }[];
  user: string;
}) {
  const scenes = input.examples.map((example) => ({
    id: example.id,
    function: example.description,
    fictionalScene: example.messages.map((message) => ({
      ...message,
      content: message.content.replace(
        /^<expression>.*?<\/expression>\s*/su,
        '',
      ),
    })),
  }));

  return [
    { role: 'system', content: input.system },
    {
      role: 'system',
      content:
        'Cenas fictícias independentes para observar a função e a evolução das reações. Cada objeto inicia uma cena distinta. Nomes, acontecimentos, experiências e conclusões pertencem a essa cena. A resposta atual se apoia no histórico real a seguir.\n<acting_demonstrations>\n' +
        JSON.stringify(scenes) +
        '\n</acting_demonstrations>',
    },
    ...input.history.map((message) => ({ ...message })),
    { role: 'user', content: input.user },
  ];
}
