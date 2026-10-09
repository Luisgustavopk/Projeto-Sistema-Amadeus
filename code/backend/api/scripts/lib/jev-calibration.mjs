import { createHash } from 'node:crypto';

export const digest = (text) => createHash('sha256').update(text).digest('hex');
const normalized = (text) => text.replace(/\r\n/gu, '\n').trim();
export const criteriaNames = [
  'Interlocução',
  'Proporcionalidade',
  'Sustentação factual',
  'Continuidade',
  'Persona',
  'Perguntas',
  'Gatilho, alvo, intensidade e recomposição',
  'Expressividade',
];

// This parses evaluation documents only; it never classifies live conversation.
export function parseReview(text) {
  const items = [];
  const blocks = normalized(text)
    .split(/^## Item /mu)
    .slice(1);
  for (const block of blocks) {
    const header = /^(\d+) — ([a-f0-9]{12})\n/u.exec(block);
    if (!header) throw new Error('Cabeçalho de ficha inválido.');
    const split = block.split('**Sua avaliação:**');
    if (split.length !== 2) throw new Error('Avaliação ausente ou duplicada.');
    const [context, notes] = split;
    const field = (name) => {
      const lines = notes
        .split('\n')
        .filter((line) => line.startsWith(`- ${name}:`));
      if (lines.length !== 1)
        throw new Error(`Campo ausente ou duplicado: ${name}.`);
      return lines[0].slice(name.length + 3).trim();
    };
    const preference = field('Preferência');
    const template = preference.includes('/');
    if (!template && !['A', 'B', 'empate', 'incerto'].includes(preference))
      throw new Error('Preferência desconhecida.');
    const acceptable = {};
    const checks = {};
    for (const side of ['A', 'B']) {
      acceptable[side] = field(`${side} aceitável`);
      if (!template && !['sim', 'não', 'incerto'].includes(acceptable[side]))
        throw new Error('Aceitabilidade desconhecida.');
    }
    for (const name of criteriaNames) {
      const line = notes
        .split('\n')
        .find((value) => value.startsWith(`- ${name} — A:`));
      const match = line && /— A:\s*([^;]*);\s*B:\s*(.*?)\s*$/u.exec(line);
      if (!match) throw new Error(`Critério ausente: ${name}.`);
      checks[name] = { A: match[1].trim(), B: match[2].trim() };
      if (
        !template &&
        Object.values(checks[name]).some(
          (value) =>
            !['aprova', 'reprova', 'incerto', 'não aplicável'].includes(value),
        )
      )
        throw new Error(`Nota desconhecida: ${name}.`);
    }
    const annotationPattern = /^OBS[^\n]*(?:\n[ \t]+[^\n]*)*/gmu;
    const annotations = [...context.matchAll(annotationPattern)].map(
      (match) => match[0],
    );
    // Preserve owner comments, but exclude them from what the blinded judge sees.
    const blindContext = context.replace(annotationPattern, '');
    const current = /\*\*Fala atual:\*\* ([^\n]+)/u.exec(blindContext)?.[1];
    if (!current) throw new Error('Fala atual ausente.');
    const options = {};
    for (const side of ['A', 'B']) {
      const segment = blindContext
        .split(`### ${side}\n`)[1]
        ?.split(/^### [AB]$/mu)[0];
      if (!segment) throw new Error('Opção ausente.');
      const parts = segment.split('**Resposta a avaliar:**');
      if (parts.length !== 2) throw new Error('Resposta ausente ou duplicada.');
      options[side] = { context: parts[0].trim(), reply: parts[1].trim() };
    }
    const sharedFacts =
      blindContext
        .split('### A\n')[0]
        .split('**Fatos fornecidos:**')[1]
        ?.trim() ?? '';
    items.push({
      number: Number(header[1]),
      id: header[2],
      current,
      sharedFacts,
      context: blindContext,
      options,
      annotations,
      review: template
        ? null
        : { preference, acceptable, checks, reason: field('Motivo') },
      rawNotes: notes.trim(),
    });
  }
  if (
    !items.length ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error('Ficha vazia ou IDs duplicados.');
  return items;
}

export function verifyPairs(reviewed, original, mapping) {
  if (
    reviewed.length !== original.length ||
    reviewed.length !== mapping.items.length
  )
    throw new Error('Quantidade de fichas divergente.');
  for (const item of reviewed) {
    const source = original.find((entry) => entry.id === item.id);
    const mapped = mapping.items.find((entry) => entry.id === item.id);
    if (!source || !mapped || item.number !== mapped.item || !item.review)
      throw new Error('Ficha desconhecida, renumerada ou sem revisão.');
    if (
      item.current !== source.current ||
      JSON.stringify(item.options) !== JSON.stringify(source.options)
    )
      throw new Error(`Contexto ou resposta alterada: ${item.id}.`);
  }
}

export function parseIntentKey(text, extra) {
  const rows = [
    ...text.matchAll(
      /^\| (\d+) \(([a-f0-9]{12})\) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gmu,
    ),
  ];
  if (
    rows.length !== extra.length ||
    new Set(rows.map((row) => row[2])).size !== extra.length
  )
    throw new Error('Gabarito incompleto ou duplicado.');
  return rows.map((match) => {
    const [, number, id, family, defectSide, description] = match;
    if (!extra.some((item) => item.id === id && item.number === Number(number)))
      throw new Error('Gabarito com ID divergente.');
    if (!['A', 'B', 'nenhum', 'ambos'].includes(defectSide.trim()))
      throw new Error('Lado do defeito desconhecido.');
    return {
      number: Number(number),
      id,
      family: family.trim(),
      defectSide: defectSide.trim(),
      description: description.trim(),
      provenance: 'agent-design-intent-not-human-label',
    };
  });
}

export function summarizeOwner(items, mapping, pendingIds = []) {
  const result = {
    reviewed: items.length,
    preferences: {},
    preferredAuthors: {},
    pendingPreferenceIds: pendingIds,
    criteria: {},
    acceptability: {},
    warnings: [],
  };
  const increment = (target, key) => {
    target[key] = (target[key] ?? 0) + 1;
  };
  for (const item of items) {
    const map = mapping.items.find((entry) => entry.id === item.id);
    increment(result.preferences, item.review.preference);
    if (['A', 'B'].includes(item.review.preference)) {
      const side = item.review.preference;
      if (!pendingIds.includes(item.id))
        increment(
          result.preferredAuthors,
          map.options.find((entry) => entry.label === side).model,
        );
      if (item.review.acceptable[side] !== 'sim')
        result.warnings.push({
          id: item.id,
          number: item.number,
          kind: 'preferred-not-approved',
          preference: side,
        });
    }
    for (const side of ['A', 'B']) {
      const model = map.options.find((entry) => entry.label === side).model;
      result.acceptability[model] ??= {};
      increment(result.acceptability[model], item.review.acceptable[side]);
      for (const name of criteriaNames) {
        result.criteria[name] ??= {};
        result.criteria[name][model] ??= {};
        increment(result.criteria[name][model], item.review.checks[name][side]);
      }
    }
  }
  return result;
}

export function blindState(item, swapped = false) {
  return {
    currentUserText: item.current,
    sharedFacts: item.sharedFacts,
    options: {
      A: item.options[swapped ? 'B' : 'A'],
      B: item.options[swapped ? 'A' : 'B'],
    },
  };
}

export function remapPreference(choice, swapped) {
  return swapped && ['A', 'B'].includes(choice)
    ? choice === 'A'
      ? 'B'
      : 'A'
    : choice;
}

export function preferenceAgreement(items, verdicts, pendingIds = []) {
  let compared = 0,
    matches = 0;
  const exclusions = [];
  for (const item of items) {
    if (
      !item.review ||
      pendingIds.includes(item.id) ||
      item.review.preference === 'incerto'
    ) {
      exclusions.push(item.id);
      continue;
    }
    const verdict = verdicts.find((entry) => entry.id === item.id);
    if (
      !verdict ||
      !['A', 'B', 'empate', 'nenhuma', 'incerto'].includes(verdict.preference)
    )
      continue;
    compared++;
    if (verdict.preference === item.review.preference) matches++;
  }
  return {
    compared,
    matches,
    accuracy: compared ? matches / compared : null,
    exclusions,
  };
}

export function criterionAgreement(items, calls, criterion) {
  const labelFor = (item, side) => {
    if (criterion === 'acceptable')
      return item.review.acceptable[side] === 'não'
        ? 'nao'
        : item.review.acceptable[side];
    const name = {
      persona: 'Persona',
      emotion: 'Gatilho, alvo, intensidade e recomposição',
      expressivity: 'Expressividade',
    }[criterion];
    return {
      aprova: 'sim',
      reprova: 'nao',
      incerto: 'incerto',
      'não aplicável': null,
    }[item.review.checks[name][side]];
  };
  const result = {
    compared: 0,
    exactMatches: 0,
    ownerUncertain: 0,
    definiteLabels: 0,
    judgeAbstainedOnDefinite: 0,
    definiteCorrect: 0,
    ownerRejected: 0,
    falseApprovals: 0,
    confusion: {},
    highConfidenceCompared: 0,
    highConfidenceCorrect: 0,
  };
  for (const item of items)
    for (const side of ['A', 'B']) {
      if (!item.review) continue;
      const answer = calls.find(
        (call) => call.group === 'owner' && call.itemId === item.id,
      )?.answers?.[`${criterion}_${side}`];
      const expected = labelFor(item, side);
      if (!answer || expected == null) continue;
      result.compared++;
      if (answer.choice === expected) result.exactMatches++;
      const key = `${expected}->${answer.choice}`;
      result.confusion[key] = (result.confusion[key] ?? 0) + 1;
      if (expected === 'incerto') {
        result.ownerUncertain++;
        continue;
      }
      result.definiteLabels++;
      if (answer.choice === 'incerto') result.judgeAbstainedOnDefinite++;
      if (answer.choice === expected) result.definiteCorrect++;
      if (expected === 'nao') {
        result.ownerRejected++;
        if (answer.choice === 'sim') result.falseApprovals++;
      }
      if (answer.confidence >= 0.7) {
        result.highConfidenceCompared++;
        if (answer.choice === expected) result.highConfidenceCorrect++;
      }
    }
  return {
    ...result,
    definiteAccuracy: result.definiteLabels
      ? result.definiteCorrect / result.definiteLabels
      : null,
    falseApprovalRate: result.ownerRejected
      ? result.falseApprovals / result.ownerRejected
      : null,
  };
}
