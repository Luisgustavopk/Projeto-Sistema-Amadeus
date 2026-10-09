import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareConversationRuntime } from "../conversation-runtime.mjs";

for (const [name, response] of [
  ["resposta vazia 404 da interface", () => new Response(null, { status: 404 })],
  [
    "HTML da interface",
    () => new Response("<!doctype html><html></html>", {
      headers: { "content-type": "text/html" },
    }),
  ],
]) {
  test(`orienta o endereço da API ao receber ${name}, sem configurar ou abrir chamada`, async () => {
    let requests = 0;
    await assert.rejects(
      prepareConversationRuntime(
        { apiUrl: "http://127.0.0.1:5173", credential: "test" },
        {
          author: "configured",
          expressionMode: "parallel",
          firstFlushMs: 200,
          observerPersonalConsent: false,
        },
        async () => {
          requests++;
          return response();
        },
      ),
      /Endereço da API: normalmente http:\/\/127\.0\.0\.1:3001/,
    );
    assert.equal(requests, 1);
  });
}

test("escolhe autor explicitamente antes de aplicar opções sem armazenar a credencial ou conteúdo de conversa", async () => {
  const requests = [];
  const state = {
    revision: 2,
    options: {
      expressionMode: "embedded",
      firstFlushMs: 700,
      observerTimeoutMs: 1500,
      observerPersonalConsent: false,
    },
  };
  const request = async (url, input) => {
    requests.push({ url, ...input });
    return {
      ok: true,
      json: async () => (url.endsWith("/author") ? {} : state),
    };
  };
  await prepareConversationRuntime(
    { apiUrl: "http://127.0.0.1:3001", credential: "test" },
    {
      author: "deepseek",
      expressionMode: "parallel",
      firstFlushMs: 200,
      observerPersonalConsent: false,
    },
    request,
  );
  assert.deepEqual(
    requests.map((r) => r.method),
    ["POST", "GET", "PUT"],
  );
  assert.deepEqual(JSON.parse(requests[2].body), {
    expectedRevision: 2,
    options: {
      ...state.options,
      expressionMode: "parallel",
      firstFlushMs: 200,
    },
  });
  assert.ok(requests.every((r) => !r.body?.includes("test")));
  assert.ok(
    requests.every((r) => r.headers.authorization === "Bearer test"),
  );
});

test("mantém o autor configurado e propaga rejeição da API antes de abrir a chamada", async () => {
  const requests = [];
  await assert.rejects(
    prepareConversationRuntime(
      { apiUrl: "http://127.0.0.1:3001", credential: "test" },
      {
        author: "configured",
        expressionMode: "parallel",
        firstFlushMs: 200,
        observerPersonalConsent: false,
      },
      async (url) => {
        requests.push(url);
        return {
          ok: false,
          json: async () => ({ message: "Configuração ocupada." }),
        };
      },
    ),
    /ocupada/,
  );
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith("/runtime"));
});
