import { ProviderInvalidError } from '../../domain/errors/providers.ts';

export async function* decodeServerSentEvents(
  response: Response,
): AsyncIterable<unknown> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new ProviderInvalidError();
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let bytes = 0;
  let data = '';

  function decode(value: string) {
    if (value.trim() === '[DONE]') {
      return null;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new ProviderInvalidError('Evento SSE inválido.');
    }
  }

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        buffer += decoder.decode();
      } else {
        bytes += next.value.length;

        if (bytes > 262144) {
          throw new ProviderInvalidError('Streaming excedeu o limite.');
        }

        buffer += decoder.decode(next.value, { stream: true });
      }

      if (buffer.length > 131072) {
        throw new ProviderInvalidError('Evento SSE excedeu o limite.');
      }

      let end;

      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);

        if (line.startsWith('data:')) {
          data += (data ? '\n' : '') + line.slice(5).trimStart();
        } else if (!line && data) {
          const value = decode(data);
          data = '';

          if (value !== null) {
            yield value;
          }
        }
      }

      if (next.done) {
        if (buffer.startsWith('data:')) {
          data += (data ? '\n' : '') + buffer.slice(5).trimStart();
        }

        if (data) {
          const value = decode(data);

          if (value !== null) {
            yield value;
          }
        }

        break;
      }
    }
  } finally {
    await reader.cancel();
  }
}
