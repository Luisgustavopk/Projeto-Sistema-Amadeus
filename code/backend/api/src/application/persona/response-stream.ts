import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  type Expression,
} from '../../domain/persona/expression.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';

const OPEN = '<expression>';
const CLOSE = '</expression>';
const MAX_HEADER = 512;

/** Consume only an optional bounded prefix; ordinary text keeps streaming. */
export async function* readPersonaResponse(
  source: AsyncIterable<string>,
  onExpression: (expression: Expression, valid: boolean) => void,
): AsyncIterable<string> {
  let pending = '';
  let header = true;
  let bodyStarted = false;

  for await (const chunk of source) {
    if (!header) {
      const text: string = bodyStarted ? chunk : chunk.trimStart();
      bodyStarted ||= Boolean(text);

      if (text) {
        yield text;
      }

      continue;
    }

    pending += chunk;
    pending = pending.trimStart();

    if (OPEN.startsWith(pending) && pending.length < OPEN.length) {
      continue;
    }

    if (!pending.startsWith(OPEN)) {
      header = false;
      onExpression({ ...NEUTRAL_EXPRESSION }, false);
      bodyStarted = Boolean(pending);
      yield pending;
      pending = '';
      continue;
    }

    const end = pending.indexOf(CLOSE, OPEN.length);

    if (end < 0) {
      if (pending.length > MAX_HEADER) {
        throw new ProviderInvalidError(
          'Cabeçalho de expressão inválido ou excessivo.',
        );
      }

      continue;
    }

    let expression: Expression = { ...NEUTRAL_EXPRESSION };
    let valid = false;

    if (end + CLOSE.length <= MAX_HEADER) {
      try {
        const result = ExpressionSchema.safeParse(
          JSON.parse(pending.slice(OPEN.length, end)),
        );

        if (result.success) {
          expression = result.data;
          valid = true;
        }
      } catch {
        // Invalid model metadata falls back to neutral; it is never spoken.
      }
    }

    onExpression(expression, valid);
    header = false;
    const text = pending.slice(end + CLOSE.length).trimStart();
    pending = '';

    if (text) {
      bodyStarted = true;
      yield text;
    }
  }

  if (header) {
    onExpression({ ...NEUTRAL_EXPRESSION }, false);

    if (pending.startsWith(OPEN) || (pending && OPEN.startsWith(pending))) {
      throw new ProviderInvalidError('Cabeçalho de expressão incompleto.');
    }

    if (pending) {
      bodyStarted = true;
      yield pending;
    }
  }

  if (!bodyStarted) {
    throw new ProviderInvalidError('O modelo não retornou texto para falar.');
  }
}

/** Reject structural leakage before either displaying or synthesizing a segment. */
export function validateSpokenSegment(text: string) {
  if (
    /<\/?expression\b|```|[{}]|["'](?:intent|emotion|intensity)["']\s*:/iu.test(
      text,
    )
  ) {
    throw new ProviderInvalidError(
      'A resposta contém metadados em vez de fala.',
    );
  }

  const spoken = text
    .replace(/\*[^*]{1,120}\*/gu, '')
    .replace(
      /\((?:suspira|sorrindo|ri|rindo|pausa|voz|tom|irônico|irônica|sussurra)[^)]{0,100}\)/giu,
      '',
    )
    .replace(/\s+/gu, ' ')
    .trim();

  if (
    /\*|\((?:suspira|sorrindo|ri\b|rindo|pausa|voz\b|tom\b|irônico|irônica|sussurra)/iu.test(
      spoken,
    )
  ) {
    throw new ProviderInvalidError(
      'Rubrica de atuação incompleta na resposta.',
    );
  }

  return spoken;
}
