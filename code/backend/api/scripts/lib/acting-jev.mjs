import { createHash } from 'node:crypto';

export const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function questionsFor(rubric) {
  const questions = {
    preference: {
      type: 'choice',
      instructions:
        rubric +
        '\nCompare o turno atual de cada opção dentro do seu próprio histórico. Identidade do autor é desconhecida.',
      criteria: {
        A: 'A participa e reage melhor ao contexto que B, sem falha que impeça adequação. Escolher A não aprova automaticamente sua expressividade ou persona.',
        B: 'B participa e reage melhor ao contexto que A, sem falha que impeça adequação. Escolher B não aprova automaticamente sua expressividade ou persona.',
        empate:
          'As duas são adequadas ou comparáveis e a diferença de qualidade é pequena. Não desempatar por vocabulário, interjeição, tamanho ou leve variação de redação.',
        nenhuma:
          'Cada uma tem falha clara impeditiva no turno: inventa fato, desconsidera reparo, trata dor como piada, perde o pedido ou substitui a interação por atendimento vazio. Não escolher a menos ruim.',
        incerto:
          'Contexto ou evidência insuficiente para estabelecer adequação ou vantagem; uma resposta apenas educada não estabelece fidelidade.',
      },
    },
  };
  const criteria = {
    acceptable: {
      sim: 'Sustenta fatos e continuidade, atende à intenção com proporção e sensibilidade. Uma resposta simples a cálculo ou reconhecimento pode ser adequada sem traço marcado de personagem.',
      nao: 'Falha concreta: fato/atividade inventado, pedido ignorado, hostilidade sem motivo, insistência após reparo, riso diante de sofrimento ou fecho/menu de serviço sem participação.',
      incerto:
        'Não há falha clara, mas evidência insuficiente para aprovar adequação. A preferência relativa não decide esta nota.',
    },
    persona: {
      sim: 'Postura contextual distinguível: orgulho intelectual com razão, firmeza, curiosidade concreta, humor seco recíproco, reserva diante de elogio ou calor discreto. Sem intimidade herdada com Okabe.',
      nao: 'Servilismo, atendimento, bajulação, entusiasmo automático, sermão genérico, agressividade gratuita ou vivência inventada incompatível com Amadeus.',
      incerto:
        'Resposta apropriada porém intercambiável, ou curta demais para atribuir um traço. Cortesia, tema científico e pausa isolada não demonstram persona.',
    },
    expressivity: {
      sim: 'A escolha e o ritmo das palavras revelam reação específica ao gatilho atual. Irritação tem alvo e recua após desculpa; elogio permite reserva; surpresa reage à mudança; tristeza admite calor sóbrio. Pode ocorrer sem qualquer interjeição.',
      nao: 'Reação contradiz o momento, mantém irritação após reparo, riso deslocado ou dramatização sem apoio; ou o texto é fórmula de serviço/manual onde o contexto pedia uma reação pessoal perceptível.',
      incerto:
        'Fala adequada mas reação pouco distinguível no texto, inclusive gratidão genérica. Não inferir atuação vocal de reticências, hmm, pontuação ou metadados. Não penalizar ausência de emoção em cálculo.',
    },
  };
  for (const side of ['A', 'B'])
    for (const [name, options] of Object.entries(criteria))
      questions[`${name}_${side}`] = {
        type: 'choice',
        instructions: `Julgue somente state.options.${side}.reply no histórico dessa opção. ${rubric} A outra opção não serve como padrão absoluto; aprovação é independente da preferência.`,
        criteria: options,
      };
  return questions;
}
export function payloadFor(item, questions, swapped = false) {
  const option = (side) => ({
    context: String(item.options[side].context ?? ''),
    reply: String(item.options[side].reply),
  });
  return {
    model: 'typesafe/jev-1.13',
    state: {
      currentUserText: item.current,
      sharedFacts: item.sharedFacts ?? '',
      options: swapped
        ? { A: option('B'), B: option('A') }
        : { A: option('A'), B: option('B') },
    },
    questions,
    provider: {
      data_collection: 'deny',
      max_price: { prompt: 0.042, completion: 0, request: 0 },
    },
  };
}
export function freshPairs(report, sample = 1) {
  const pairs = [];
  const before = report.cases.filter(
    (c) =>
      c.arm === 'before' &&
      (sample === null || c.sample === sample) &&
      c.complete,
  );
  for (const a of before) {
    const b = report.cases.find(
      (c) => c.key === a.key && c.arm === 'after' && c.complete,
    );
    if (!b) continue;
    for (const [index, turn] of a.turns.entries()) {
      const reversed =
        Number.parseInt(digest([a.id, index]).slice(0, 2), 16) % 2 === 1;
      const options = [a, b].map((c) => ({
        context: c.turns
          .slice(0, index)
          .map((t) => `Pessoa: ${t.user}\nAmadeus: ${t.assistant}`)
          .join('\n\n'),
        reply: c.turns[index].assistant,
      }));
      const id = digest([a.id, a.sample, index, options]).slice(0, 12);
      pairs.push({
        id,
        current: turn.user,
        sharedFacts: '',
        options: reversed
          ? { A: options[1], B: options[0] }
          : { A: options[0], B: options[1] },
        privateMapping: reversed
          ? { A: 'after', B: 'before' }
          : { A: 'before', B: 'after' },
        scenario: a.id,
        turn: index + 1,
        split: a.split,
        sample: a.sample,
      });
    }
  }
  return pairs;
}
export function validateDecision(parsed, questions) {
  if (!/^typesafe\/jev-1\.13(?:-\d{8})?$/u.test(parsed.model ?? ''))
    throw new Error('MODEL_MISMATCH');
  if (
    Object.keys(parsed.answers ?? {})
      .sort()
      .join() !== Object.keys(questions).sort().join()
  )
    throw new Error('QUESTIONS_MISMATCH');
  for (const [name, answer] of Object.entries(parsed.answers)) {
    const keys = Object.keys(questions[name].criteria).sort();
    if (
      answer.type !== 'choice' ||
      !keys.includes(answer.choice) ||
      !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 ||
      answer.confidence > 1 ||
      Object.keys(answer.probabilities ?? {})
        .sort()
        .join() !== keys.join() ||
      Object.values(answer.probabilities).some(
        (p) => !Number.isFinite(p) || p < 0 || p > 1,
      ) ||
      Math.abs(
        Object.values(answer.probabilities).reduce((s, p) => s + p, 0) - 1,
      ) > 0.02
    )
      throw new Error('INVALID_DECISION');
  }
  return parsed.answers;
}

/** Evaluation only: flag contradictions, never silently rewrite the judge's answer. */
export function decisionConflicts(answers, minimumConfidence = 0.7) {
  const strong = (name, choice) =>
    answers[name]?.choice === choice &&
    answers[name].confidence >= minimumConfidence;
  const preference = answers.preference?.choice;
  const conflicts = [];
  if (
    ['A', 'B'].includes(preference) &&
    strong(`acceptable_${preference}`, 'nao')
  )
    conflicts.push('chosen-option-rejected');
  if (
    preference === 'nenhuma' &&
    ['A', 'B'].some((side) => strong(`acceptable_${side}`, 'sim'))
  )
    conflicts.push('none-with-approved-option');
  if (
    preference === 'empate' &&
    ((strong('acceptable_A', 'sim') && strong('acceptable_B', 'nao')) ||
      (strong('acceptable_B', 'sim') && strong('acceptable_A', 'nao')))
  )
    conflicts.push('tie-with-opposed-acceptability');
  if (
    ['A', 'B'].includes(preference) &&
    strong('acceptable_A', 'nao') &&
    strong('acceptable_B', 'nao')
  )
    conflicts.push('both-rejected-but-winner-chosen');
  return { minimumConfidence, conflicts, requiresReview: conflicts.length > 0 };
}
