import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient } from '../src/lib/api-client.ts';
test('the HTTP boundary distinguishes empty, malformed and unsuccessful responses', async () => {
  const json = createApiClient('http://localhost:8000/', async (url) => {
    assert.equal(url.href, 'http://localhost:8000/check');
    return Response.json({ ok: true });
  });
  assert.deepEqual(await json('/check'), { ok: true });
  const empty = createApiClient(
    'http://localhost:8000',
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(await empty('/check'), null);
  const malformed = createApiClient(
    'http://localhost:8000',
    async () =>
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
  );
  await assert.rejects(
    malformed('/check'),
    (error) => error instanceof ApiError && /JSON/.test(error.message),
  );
  const unauthorized = createApiClient('http://localhost:8000', async () =>
    Response.json({ message: 'denied' }, { status: 401 }),
  );
  await assert.rejects(
    unauthorized('/check'),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.body.message === 'denied',
  );
});
test('the HTTP boundary forwards cancellation and enforces a timeout', async () => {
  const controller = new AbortController();
  controller.abort();
  const pending = createApiClient(
    'http://localhost:8000',
    async (_url, options) => {
      options.signal.throwIfAborted();
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true },
        ),
      );
    },
  );
  await assert.rejects(pending('/check', { signal: controller.signal }), {
    name: 'AbortError',
  });
  // Keep the event loop alive while AbortSignal.timeout's timer is unref'd.
  const hold = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(pending('/check', { timeoutMs: 10 }), {
      name: 'TimeoutError',
    });
  } finally {
    clearTimeout(hold);
  }
});
