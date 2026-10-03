import { ClientEvent, type ClientMessage } from '../protocol/client-events.ts';

type DecodeResult =
  | { ok: true; event: ClientMessage }
  | {
      ok: false;
      code:
        'AUDIO_NOT_IMPLEMENTED' | 'INVALID_JSON' | 'INVALID_EVENT_OR_VERSION';
    };

export function decodeClientMessage(
  data: string,
  isBinary: boolean,
): DecodeResult {
  if (isBinary) {
    return { ok: false, code: 'AUDIO_NOT_IMPLEMENTED' };
  }

  let json: unknown;

  try {
    json = JSON.parse(data);
  } catch {
    return { ok: false, code: 'INVALID_JSON' };
  }

  const parsed = ClientEvent.safeParse(json);

  return parsed.success
    ? { ok: true, event: parsed.data }
    : { ok: false, code: 'INVALID_EVENT_OR_VERSION' };
}
