import { createCallClient } from "/call-client/index.mjs";
import { createVoiceBaseline } from "/call-client/baseline.mjs";
import { createTestReport } from "./report.mjs";
import { attachTtsDiagnostic } from "./tts-diagnostic.mjs";
import { attachSttDiagnostic } from "./stt-diagnostic.mjs";
import { describeCallClosure } from "./connection-status.mjs";
import { prepareConversationRuntime } from "./conversation-runtime.mjs";

const element = (id) => document.getElementById(id);
const baseline = createVoiceBaseline();
const report = createTestReport();
const responses = new Map();
const transcripts = new Map();
const responsesWithAudio = new Set();
const log = [];
let client;
let pendingResume;
let activeConnectionSettings;
let generation = 0;
let microphone = false;
let microphonePending = false;
let state = "disconnected";
let llmDataPolicies = [];
let diagnosticBusy = false;
let renderDiagnostic;

function showError(error) {
  element("error").textContent =
    error.message || "Não foi possível completar a operação.";
  element("error").hidden = false;
}

function renderControls() {
  const connected = Boolean(client);
  const labels = {
    disconnected: "Desconectado",
    connecting: "Conectando…",
    idle: "Pronto",
    listening: "Ouvindo",
    thinking: "Pensando",
    speaking: "Falando",
    error: "Erro na resposta",
  };
  element("status").textContent = labels[state] || state;
  element("status").dataset.active = String(connected);
  element("connect").disabled =
    connected || state === "connecting" || diagnosticBusy;
  element("disconnect").disabled = !connected;
  element("api-url").disabled = connected || state === "connecting";
  element("token").disabled = connected || state === "connecting";
  const dataClass = element("data-class").value;
  const personalDataAllowed = llmDataPolicies.some(({ dataPolicy }) =>
    ["personal-approved", "local-approved"].includes(dataPolicy),
  );
  element("data-class").disabled = connected || state === "connecting";
  for (const id of [
    "conversation-author",
    "expression-mode",
    "first-flush",
    "observer-personal-consent",
  ])
    element(id).disabled = connected || state === "connecting";
  element("microphone").disabled =
    !connected ||
    microphonePending ||
    dataClass === "synthetic" ||
    (dataClass === "personal" && !personalDataAllowed);
  element("microphone").textContent = microphone
    ? "Pausar microfone"
    : "Iniciar microfone";
  element("microphone-status").textContent = microphone
    ? "Microfone ativo"
    : "Microfone desligado";
  element("interrupt").disabled =
    !connected || !["thinking", "speaking"].includes(state);
  renderDiagnostic?.();
  element("text").disabled =
    !connected || (dataClass === "personal" && !personalDataAllowed);
  element("send").disabled =
    !connected || (dataClass === "personal" && !personalDataAllowed);
}

function message(role, text) {
  element("conversation").querySelector(".empty")?.remove();
  const node = document.createElement("p");
  node.className = "message " + role;
  node.textContent = (role === "user" ? "Você: " : "Amadeus: ") + text;
  element("conversation").append(node);
  while (element("conversation").children.length > 100)
    element("conversation").firstElementChild.remove();
  node.scrollIntoView({ block: "nearest" });
  return node;
}

function receive(event) {
  report.event(event);
  log.push(
    JSON.stringify({
      type: event.type,
      state: event.state,
      code: event.code,
      role: event.role,
      turnId: event.turnId,
      personaVersion: event.personaVersion,
      intent: event.intent,
      emotion: event.emotion,
      intensity: event.intensity,
      deliveryPresetId: event.deliveryPresetId,
      metadataValid: event.metadataValid,
      phase: event.phase,
      deliveryApplied: event.deliveryApplied,
      reason: event.type === "connection.closed" ? event.reason : undefined,
      wasClean: event.wasClean,
    }),
  );
  if (log.length > 200) log.shift();
  element("events").textContent = log.join("\n");
  if (event.type === "state") {
    state = event.state;
    if (state === "thinking") element("error").hidden = true;
  }
  if (
    event.type === "transcript.partial" ||
    event.type === "transcript.final"
  ) {
    const key = `${event.sessionId ?? generation}:${event.turnId}`;
    let node = transcripts.get(key);
    if (!node) {
      node = message("user", "");
      transcripts.set(key, node);
      if (transcripts.size > 100)
        transcripts.delete(transcripts.keys().next().value);
    }
    node.textContent =
      "Você: " + event.text + (event.type === "transcript.partial" ? "…" : "");
  }
  if (event.type === "reply.text") {
    const key = event.responseId;
    let response = responses.get(key);
    if (!response) {
      response = { node: message("assistant", ""), segments: new Map() };
      responses.set(key, response);
      if (responses.size > 100) responses.delete(responses.keys().next().value);
    }
    response.segments.set(event.position, event.text);
    response.node.textContent =
      "Amadeus: " +
      [...response.segments]
        .sort(([a], [b]) => a - b)
        .map(([, text]) => text)
        .join(" ");
  }
  if (event.type === "audio.segment") {
    responsesWithAudio.add(event.responseId);
  }
  if (event.type === "reply.done") {
    if (!responsesWithAudio.has(event.responseId)) {
      showError(
        new Error(
          "A resposta em texto foi gerada, mas nenhum áudio chegou. Confira se há perfil de voz ativo e leia o evento de erro acima.",
        ),
      );
    }
    responsesWithAudio.delete(event.responseId);
  }
  if (event.type === "error") {
    const message =
      event.code === "PROVIDER_TEMPORARILY_UNAVAILABLE"
        ? "Os provedores LLM estão temporariamente indisponíveis. Aguarde e tente outra mensagem; sua conexão continua ativa."
        : event.code === "QUOTA_EXCEEDED"
          ? "Esta operação atingiu um orçamento local ou um limite do provedor. Confira GET /v1/usage e o serviço indicado em quota.warning; o limite pode ser por minuto, por modelo ou pela conta."
          : event.code === "PROVIDER_BUSY"
            ? "O serviço de fala ainda está ocupado. Aguarde um momento e tente outra frase."
            : event.code === "NO_SPEECH_DETECTED"
              ? "Não consegui reconhecer fala neste turno. Confira o microfone e o VAD e tente novamente."
              : event.code === "VOICE_NOT_READY"
                ? "Não há perfil de voz ativo; a resposta saiu apenas em texto. Ative o perfil de voz aprovado na API."
                : event.code === "TTS_UNAVAILABLE_TEXT_AVAILABLE"
                  ? "A resposta em texto foi gerada, mas o serviço TTS não produziu áudio. Verifique TTS em GET /v1/health/details e consulte os logs/GET /metrics do serviço."
                  : "Falha na resposta: " +
                    event.code +
                    ". Confira o terminal da API e do serviço indicado.";
    showError(new Error(message));
  }
  if (event.type === "connection.closed") {
    if (client && event.code !== 1000 && event.code !== 4001) {
      pendingResume = { ...client.resumeState(), ...activeConnectionSettings };
    }
    client = undefined;
    microphone = false;
    state = "disconnected";
    const closure = describeCallClosure(event);
    if (closure) {
      showError(
        new Error(
          element("error").hidden
            ? closure
            : element("error").textContent + " " + closure,
        ),
      );
    }
  }
  renderControls();
}

function timing(sample) {
  baseline.record(sample);
  report.timing(sample);
  const summary = baseline.summary();
  const format = (value) =>
    value === null ? "—" : (value / 1000).toFixed(2) + " s";
  if (sample.stage === "firstAudioScheduled")
    element("last-time").textContent = format(sample.milliseconds);
  element("median").textContent = format(summary.firstAudioScheduled.medianMs);
  element("p95").textContent = format(summary.firstAudioScheduled.p95Ms);
  element("max").textContent =
    format(summary.firstAudioScheduled.maxMs) +
    " / " +
    format(summary.speechStartToFirstAudio.maxMs);
  element("samples").textContent =
    summary.firstAudioScheduled.samples +
    " / " +
    summary.automaticInterruption.samples +
    " / " +
    summary.localInterruption.samples;
  element("baseline-status").textContent = summary.sufficientSample
    ? "Mediana do fim estimado da fala ao áudio agendado: " +
      (summary.firstAudioTargetMet ? "até 2 s" : "acima de 2 s") +
      "; interrupção automática estimada: " +
      (summary.interruptionTargetMet
        ? "p95 até 500 ms"
        : "p95 acima de 500 ms") +
      ". Saída física ainda requer medição separada."
    : "Coleta: " +
      summary.firstAudioScheduled.samples +
      "/100 respostas, " +
      summary.automaticInterruption.samples +
      "/30 interrupções automáticas; " +
      summary.localInterruption.samples +
      " paradas manuais (diagnóstico). São estimativas do navegador.";
}

function settings() {
  const apiUrl = new URL(element("api-url").value);
  if (
    !["http:", "https:"].includes(apiUrl.protocol) ||
    !["127.0.0.1", "localhost"].includes(apiUrl.hostname)
  )
    throw new Error("Use o endereço local da API: http://127.0.0.1:3001.");
  const credential = element("token").value.trim();
  if (!credential) throw new Error("Informe o API_ACCESS_TOKEN da API.");
  return {
    apiUrl: apiUrl.origin,
    credential,
    dataClass: element("data-class").value,
  };
}

async function inspect() {
  element("error").hidden = true;
  element("data-policy-warning").hidden = true;
  element("inspect").disabled = true;
  try {
    const { apiUrl, credential } = settings();
    const headers = { authorization: "Bearer " + credential };
    const [healthResponse, capabilitiesResponse] = await Promise.all([
      fetch(apiUrl + "/v1/health/details", {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
      fetch(apiUrl + "/v1/capabilities", {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
    ]);
    if (!healthResponse.ok || !capabilitiesResponse.ok)
      throw new Error(
        "Verificação recusada. Confira o token, ALLOWED_ORIGINS e as capacidades da API.",
      );
    const [health, capabilities] = await Promise.all([
      healthResponse.json(),
      capabilitiesResponse.json(),
    ]);
    const llm = capabilities.providers.find(
      (provider) => provider.role === "llm",
    );
    llmDataPolicies = llm
      ? [
          {
            adapter: llm.adapter,
            model: llm.model,
            dataPolicy: llm.dataPolicy,
          },
          ...(llm.fallbacks || []),
          ...(llm.local ? [llm.local] : []),
        ]
      : [];
    element("providers").textContent =
      "API: " +
      health.api +
      " · Banco: " +
      health.database +
      " · " +
      capabilities.providers
        .map(
          (provider) =>
            provider.role.toUpperCase() +
            ": " +
            (provider.available ? "disponível" : "indisponível") +
            " (" +
            provider.dataPolicy +
            ")",
        )
        .join(" · ") +
      (llmDataPolicies.length > 1
        ? " · Modelos LLM adicionais: " +
          llmDataPolicies
            .slice(1)
            .map(
              ({ adapter, model, dataPolicy }) =>
                adapter + "/" + model + " (" + dataPolicy + ")",
            )
            .join(", ")
        : "");
    const personalAllowed = llmDataPolicies.some(({ dataPolicy }) =>
      ["personal-approved", "local-approved"].includes(dataPolicy),
    );
    const deniedFallbacks = llmDataPolicies
      .slice(1)
      .filter(
        ({ dataPolicy }) =>
          !["personal-approved", "local-approved"].includes(dataPolicy),
      );
    if (element("data-class").value === "personal" && !personalAllowed) {
      element("data-policy-warning").textContent =
        "Nenhum provedor LLM da cadeia está aprovado para dados pessoais. Microfone e mensagens pessoais ficam bloqueados.";
      element("data-policy-warning").hidden = false;
    } else if (
      element("data-class").value === "personal" &&
      deniedFallbacks.length
    ) {
      element("data-policy-warning").textContent =
        "Somente provedores com política personal-approved/local-approved receberão dados pessoais. Reservas não aprovadas serão puladas.";
      element("data-policy-warning").hidden = false;
    }
  } catch (error) {
    llmDataPolicies = [];
    showError(
      error instanceof TypeError
        ? new Error(
            "Não foi possível acessar a API. Confira se ela está rodando e se ALLOWED_ORIGINS inclui " +
              location.origin +
              ".",
          )
        : error,
    );
  } finally {
    element("inspect").disabled = false;
    renderControls();
  }
}

element("presence").addEventListener("change", () =>
  client?.setPresence(element("presence").checked),
);
element("connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (client || state === "connecting" || diagnosticBusy) return;
  element("error").hidden = true;
  const current = ++generation;
  try {
    const options = settings();
    activeConnectionSettings = {
      apiUrl: options.apiUrl,
      dataClass: options.dataClass,
    };
    const resumeOptions =
      pendingResume?.apiUrl === options.apiUrl &&
      pendingResume?.dataClass === options.dataClass
        ? {
            conversationId: pendingResume.conversationId,
            resume: pendingResume.resume,
          }
        : {};
    state = "connecting";
    renderControls();
    await prepareConversationRuntime(options, {
      author: element("conversation-author").value,
      expressionMode: element("expression-mode").value,
      firstFlushMs: Number(element("first-flush").value),
      observerPersonalConsent: element("observer-personal-consent").checked,
    });
    client = await createCallClient({
      ...options,
      ...resumeOptions,
      presence: element("presence").checked,
      onEvent: (value) => {
        if (current === generation) receive(value);
      },
      onTiming: timing,
      onExpression: (expression) => {
        if (current !== generation) return;
        element("expression-status").textContent = expression
          ? `Expressão: ${expression.emotion} · intenção: ${expression.intent} · intensidade: ${expression.intensity}${expression.metadataValid ? "" : " (provisória)"}`
          : "Expressão: aguardando reprodução.";
      },
      onError: (error) => {
        if (current === generation) showError(error);
      },
    });
    state = "idle";
    pendingResume = undefined;
    receive(client.session);
    void inspect();
  } catch (error) {
    state = "disconnected";
    showError(
      error instanceof TypeError
        ? new Error(
            "Falha de conexão. Confira a API, o token e a origem permitida " +
              location.origin +
              ".",
          )
        : error,
    );
  }
  renderControls();
});

element("disconnect").addEventListener("click", async () => {
  const previous = client;
  pendingResume = undefined;
  generation++;
  client = undefined;
  microphone = false;
  state = "disconnected";
  renderControls();
  try {
    await previous?.close();
  } catch (error) {
    showError(error);
  }
});

element("microphone").addEventListener("click", async () => {
  const active = client;
  if (!active || microphonePending) return;
  microphonePending = true;
  renderControls();
  try {
    if (microphone) {
      active.stopMicrophone();
      microphone = false;
    } else {
      await active.startMicrophone();
      if (client === active) microphone = true;
      else active.stopMicrophone();
    }
  } catch (error) {
    showError(
      new Error(
        "Não foi possível iniciar o microfone. Permita o acesso no navegador. " +
          error.message,
      ),
    );
  } finally {
    microphonePending = false;
    renderControls();
  }
});

element("interrupt").addEventListener("click", () => client?.interrupt());
element("inspect").addEventListener("click", inspect);
element("text-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = element("text").value.trim();
  if (!client || !text) return;
  client.text(text);
  message("user", text);
  element("text").value = "";
});
element("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report.snapshot(baseline.summary()), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    "amadeus-teste-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
renderDiagnostic = attachSttDiagnostic(
  () => !client && state !== "connecting",
  (busy) => {
    diagnosticBusy = busy;
    element("connect").disabled =
      Boolean(client) || state === "connecting" || busy;
  },
);
attachTtsDiagnostic();

window.addEventListener("pagehide", () => {
  void client?.close();
});
renderControls();
