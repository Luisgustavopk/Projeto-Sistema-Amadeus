import { createHash } from 'node:crypto';
import { textDiagnostics } from './diagnostics.ts';

/** CSV parsing and style diagnostics belong to evaluation, never runtime. */
export function parseDialogueCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  const source = text.replace(/^\uFEFF/u, '');

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field.length) {
        throw new Error('CSV inválido.');
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') {
        i++;
      }

      row.push(field);

      if (row.some(Boolean)) {
        rows.push(row);
      }

      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error('CSV com aspas abertas.');
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (
    rows.shift()?.join(',') !== 'name,response' ||
    rows.some((r) => r.length !== 2)
  ) {
    throw new Error('Colunas inesperadas no corpus.');
  }

  return rows.map((r) => ({ speaker: r[0]!, text: r[1]! }));
}

function distribution(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);

  if (!sorted.length) {
    return { samples: 0, p50: null, p90: null, p95: null };
  }

  const middle = Math.floor(sorted.length / 2);

  return {
    samples: sorted.length,
    p50:
      sorted.length % 2
        ? sorted[middle]!
        : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1]!,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
  };
}

export function corpusStyleProfile(texts: string[], locale = 'en') {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  const nonempty = texts.filter((text) => text.trim());
  const count = nonempty.length;
  const rate = (predicate: (text: string) => boolean) =>
    count ? nonempty.filter(predicate).length / count : null;

  return {
    samples: count,
    whitespaceWords: distribution(
      nonempty.map((t) => t.trim().split(/\s+/u).length),
    ),
    lexicalWords: distribution(
      nonempty.map((t) => textDiagnostics(t, [], []).words),
    ),
    sentences: distribution(
      nonempty.map(
        (t) =>
          [...segmenter.segment(t)].filter((s) =>
            /[\p{L}\p{N}]/u.test(s.segment),
          ).length,
      ),
    ),
    questionsPerUnit: distribution(
      nonempty.map((t) => (t.match(/\?+/gu) ?? []).length),
    ),
    hasQuestionRate: rate((t) => t.includes('?')),
    endsQuestionRate: rate((t) => /\?["'’”]*$/u.test(t.trim())),
    ellipsisRate: rate((t) => /\.{3}|…/u.test(t)),
    exclamationRate: rate((t) => t.includes('!')),
    stutterRate: rate((t) => /\b([a-z])[-–]\1[a-z]/iu.test(t)),
  };
}

export const sourceDigest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
