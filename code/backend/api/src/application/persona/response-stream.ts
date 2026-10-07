import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  type Expression,
} from '../../domain/persona/expression.ts';
import { ProviderInvalidError } from '../../domain/errors/providers.ts';
import {
  MemoryResponseUseSchema,
  type MemoryResponseUse,
} from '../../domain/memory/response-use.ts';

const OPEN = '<expression>';
const CLOSE = '</expression>';
const MEMORY_OPEN = '<memory>';
const MEMORY_CLOSE = '</memory>';
const MAX_HEADER = 512;

// A streamed JSON prefix may contain nested memory metadata and quoted braces.
function objectEnd(text: string) {
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return i;
    }
  }

  return -1;
}

function metadata(
  value: unknown,
  onMemoryUse?: (use: MemoryResponseUse | null) => void,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ExpressionSchema.safeParse(value);
  }

  const { memory, ...expression } = value as Record<string, unknown>;

  if (memory !== undefined) {
    const parsed = MemoryResponseUseSchema.safeParse(memory);

    if (!parsed.success) {
      throw new ProviderInvalidError('Uso de memória inválido no cabeçalho.');
    }

    onMemoryUse?.(parsed.data);
  } else {
    onMemoryUse?.(null);
  }

  if (memory !== undefined && !Object.keys(expression).length) {
    return ExpressionSchema.safeParse({ ...NEUTRAL_EXPRESSION });
  }

  return ExpressionSchema.safeParse(expression);
}

/** Consume only an optional bounded prefix; ordinary text keeps streaming. */
export async function* readPersonaResponse(
  source: AsyncIterable<string>,
  onExpression: (expression: Expression, valid: boolean) => void,
  onMemoryUse?: (use: MemoryResponseUse | null) => void,
): AsyncIterable<string> {
  let pending = '';
  let header = true;
  let bodyStarted = false;
  let tail = '';
  let footer = false;
  let bareFooter = false;

  async function* spokenBody(value: string) {
    tail += value;

    if (footer) {
      if (tail.length > MAX_HEADER) {
        throw new ProviderInvalidError('Expressão final excessiva.');
      }

      return;
    }

    const wrapped = tail.indexOf(OPEN);
    const bare = tail.indexOf('{');
    const index =
      wrapped < 0 ? bare : bare < 0 ? wrapped : Math.min(wrapped, bare);

    if (index >= 0) {
      const speech = tail.slice(0, index);
      tail = tail.slice(index);
      footer = true;
      bareFooter = index === bare;

      if (speech) {
        bodyStarted = true;
        yield speech;
      }

      if (tail.length > MAX_HEADER) {
        throw new ProviderInvalidError('Expressão final excessiva.');
      }

      return;
    }

    let keep = 0;

    for (let length = 1; length < OPEN.length; length++) {
      if (tail.endsWith(OPEN.slice(0, length))) {
        keep = length;
      }
    }

    const speech = keep ? tail.slice(0, -keep) : tail;
    tail = keep ? tail.slice(-keep) : '';

    if (speech) {
      bodyStarted = true;
      yield speech;
    }
  }

  onMemoryUse?.(null);

  for await (const chunk of source) {
    if (!header) {
      const text: string = bodyStarted ? chunk : chunk.trimStart();
      bodyStarted ||= Boolean(text);

      if (text) {
        yield* spokenBody(text);
      }

      continue;
    }

    pending += chunk;
    pending = pending.trimStart();

    if (
      MEMORY_OPEN.startsWith(pending) &&
      pending.length < MEMORY_OPEN.length
    ) {
      continue;
    }

    if (pending.startsWith(MEMORY_OPEN)) {
      const end = pending.indexOf(MEMORY_CLOSE, MEMORY_OPEN.length);

      if (end < 0) {
        if (pending.length > 96) {
          throw new ProviderInvalidError('Cabeçalho de memória excessivo.');
        }

        continue;
      }

      let use;

      try {
        use = MemoryResponseUseSchema.parse(
          JSON.parse(pending.slice(MEMORY_OPEN.length, end)),
        );
      } catch {
        throw new ProviderInvalidError('Cabeçalho de memória inválido.');
      }

      onMemoryUse?.(use);
      onExpression({ ...NEUTRAL_EXPRESSION }, true);
      header = false;
      const text = pending.slice(end + MEMORY_CLOSE.length).trimStart();
      pending = '';

      if (text) {
        yield* spokenBody(text);
      }

      continue;
    }

    if (OPEN.startsWith(pending) && pending.length < OPEN.length) {
      continue;
    }

    // Some compatible models return the specified expression object without
    // its XML wrapper. Only the three known metadata keys may form this prefix.
    if (pending.startsWith('{')) {
      const end = objectEnd(pending);

      if (end < 0) {
        if (pending.length > MAX_HEADER) {
          throw new ProviderInvalidError('Cabeçalho de expressão excessivo.');
        }

        continue;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(pending.slice(0, end + 1));
      } catch {
        throw new ProviderInvalidError('Cabeçalho de expressão inválido.');
      }

      if (
        end + 1 > MAX_HEADER ||
        !parsed ||
        typeof parsed !== 'object' ||
        ![
          'memory',
          'emotion,intensity,intent',
          'emotion,intensity,intent,memory',
        ].includes(Object.keys(parsed).sort().join(','))
      ) {
        throw new ProviderInvalidError('Objeto desconhecido no lugar de fala.');
      }

      const result = metadata(parsed, onMemoryUse);
      onExpression(
        result.success ? result.data : { ...NEUTRAL_EXPRESSION },
        result.success,
      );
      header = false;
      const text = pending.slice(end + 1).trimStart();
      pending = '';

      if (text) {
        bodyStarted = true;
        yield* spokenBody(text);
      }

      continue;
    }

    if (!pending.startsWith(OPEN)) {
      header = false;
      onExpression({ ...NEUTRAL_EXPRESSION }, false);
      onMemoryUse?.(null);
      bodyStarted = Boolean(pending);
      yield* spokenBody(pending);
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
        const result = metadata(
          JSON.parse(pending.slice(OPEN.length, end)),
          onMemoryUse,
        );

        if (result.success) {
          expression = result.data;
          valid = true;
        }
      } catch (error) {
        if (error instanceof ProviderInvalidError) {
          throw error;
        }

        onMemoryUse?.(null);
        // Invalid model metadata falls back to neutral; it is never spoken.
      }
    }

    onExpression(expression, valid);
    header = false;
    const text = pending.slice(end + CLOSE.length).trimStart();
    pending = '';

    if (text) {
      bodyStarted = true;
      yield* spokenBody(text);
    }
  }

  if (header) {
    onExpression({ ...NEUTRAL_EXPRESSION }, false);

    if (
      pending.startsWith('{') ||
      pending.startsWith(OPEN) ||
      pending.startsWith(MEMORY_OPEN) ||
      (pending && MEMORY_OPEN.startsWith(pending)) ||
      (pending && OPEN.startsWith(pending))
    ) {
      throw new ProviderInvalidError('Cabeçalho de expressão incompleto.');
    }

    if (pending) {
      bodyStarted = true;
      yield* spokenBody(pending);
    }
  }

  if (footer) {
    const end = bareFooter ? objectEnd(tail) : tail.indexOf(CLOSE, OPEN.length);
    const after = bareFooter ? end + 1 : end + CLOSE.length;

    if (end < 0 || tail.slice(after).trim()) {
      throw new ProviderInvalidError(
        'Expressão final incompleta ou fora do formato.',
      );
    }

    try {
      onExpression(
        ExpressionSchema.parse(
          JSON.parse(bareFooter ? tail : tail.slice(OPEN.length, end)),
        ),
        true,
      );
    } catch {
      throw new ProviderInvalidError('Expressão final inválida.');
    }
  } else if (tail) {
    if (OPEN.startsWith(tail)) {
      throw new ProviderInvalidError('Expressão final incompleta.');
    }

    bodyStarted = true;
    yield tail;
  }

  if (!bodyStarted) {
    throw new ProviderInvalidError('O modelo não retornou texto para falar.');
  }
}

/** Reject structural leakage before either displaying or synthesizing a segment. */
export function validateSpokenSegment(text: string) {
  if (
    /<\/?(?:expression|memory|think(?:ing)?|analysis|reasoning)\b|```|[{}]|["'](?:intent|emotion|intensity)["']\s*:/iu.test(
      text,
    )
  ) {
    throw new ProviderInvalidError(
      'A resposta contém metadados em vez de fala.',
    );
  }

  const spoken = text
    .replace(/\*\*([^*]{1,220})\*\*/gu, '$1')
    .replace(
      /\*(?:suspira|sorri|sorrindo|ri|rindo|pausa|voz|tom|irônico|irônica|sussurra)\b[^*]{0,100}\*/giu,
      '',
    )
    .replace(/\*([^*]{1,220})\*/gu, '$1')
    .replace(
      /\((?:suspira|sorrindo|ri|rindo|pausa|voz|tom|irônico|irônica|sussurra)[^)]{0,100}\)/giu,
      '',
    )
    .replace(/\s+/gu, ' ')
    .replace(/(^|[.!?]\s+)\d{1,2}[.)]\s+/gu, '$1')
    .trim();

  if (/^(?:expression|intent|emotion|intensity)\s*[.!?:;]*$/iu.test(spoken)) {
    throw new ProviderInvalidError(
      'O modelo retornou somente um nome de metadado.',
    );
  }

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
