import type { CallRecord } from './router.ts';
import { fingerprint } from './diagnostics.ts';

/** Keeps the frozen v2.1 router intact; persists the final route before fetch. */
export function createPinnedEvaluationFetch(options: {
  models: readonly {
    id: string;
    providerOnly: string;
    disableReasoning?: boolean;
  }[];
  calls: CallRecord[];
  persist: () => Promise<void>;
  fetcher?: typeof fetch;
}): typeof fetch {
  const fetcher = options.fetcher ?? fetch;

  return async (url, init) => {
    const request = JSON.parse(String(init?.body));
    const model = options.models.find((item) => item.id === request.model);
    const matches = options.calls.filter(
      (call) =>
        call.status === 'pending' &&
        fingerprint(call.request) === fingerprint(request),
    );
    const call = matches[0];

    if (
      !model ||
      matches.length !== 1 ||
      !call ||
      call.status !== 'pending' ||
      fingerprint(call.request) !== fingerprint(request)
    ) {
      throw new Error('EVALUATION_ROUTE_RECORD_MISMATCH');
    }

    request.provider = {
      ...request.provider,
      only: [model.providerOnly],
      allow_fallbacks: false,
    };

    if (model.disableReasoning) {
      request.reasoning = { enabled: false };
    }

    call.request = request;
    await options.persist();

    return fetcher(url, { ...init, body: JSON.stringify(request) });
  };
}
