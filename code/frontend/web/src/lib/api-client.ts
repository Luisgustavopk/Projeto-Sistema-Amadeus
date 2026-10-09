export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}
export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  return async function request<T>(
    path: string,
    options: RequestInit & { timeoutMs?: number } = {},
  ): Promise<T> {
    const { timeoutMs = 15000, signal, ...init } = options;
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetcher(
      new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'),
      {
        ...init,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    const text = await response.text();
    let body: unknown = text || null;
    if (text && response.headers.get('content-type')?.includes('json')) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError('Resposta JSON inválida.', response.status, text);
      }
    }
    if (!response.ok)
      throw new ApiError(
        `Falha HTTP ${response.status}.`,
        response.status,
        body,
      );
    return body as T;
  };
}
