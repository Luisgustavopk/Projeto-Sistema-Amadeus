export async function prepareConversationRuntime(
  connection,
  choices,
  request = fetch,
) {
  const invoke = async (path, method = "GET", body) => {
    const response = await request(
      connection.apiUrl.replace(/\/$/, "") + path,
      {
        method,
        headers: {
          authorization: `Bearer ${connection.credential}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "O endereço informado não retornou uma resposta JSON da API. " +
          "Confira o Endereço da API: normalmente http://127.0.0.1:3001. " +
          "A porta 5173 é da interface. Se o endereço já estiver correto, reinicie a API atualizada.",
      );
    }
    if (!response.ok)
      throw new Error(
        result.message ??
          result.error ??
          "Não foi possível configurar a conversa.",
      );
    return result;
  };
  if (choices.author !== "configured")
    await invoke("/v1/voice/runtime/author", "POST", {
      author: choices.author,
    });
  const state = await invoke("/v1/voice/runtime");
  const options = {
    ...state.options,
    expressionMode: choices.expressionMode,
    firstFlushMs: choices.firstFlushMs,
    observerPersonalConsent: choices.observerPersonalConsent,
  };
  if (JSON.stringify(options) === JSON.stringify(state.options)) return state;
  return invoke("/v1/voice/runtime", "PUT", {
    expectedRevision: state.revision,
    options,
  });
}
