import { startSampleRecording } from "./stt-sample.mjs";
import { evaluateSpeechToText } from "./speech-evaluation-client.mjs";

export function attachSttDiagnostic(canRecord, onChange) {
  const element = (id) => document.getElementById(id);
  let active,
    pending = false,
    result;
  const render = () => {
    element("stt-record").disabled = !canRecord() || pending || Boolean(active);
    element("stt-stop").disabled = !active || pending;
    element("stt-wav").disabled = !result;
    element("stt-manifest").disabled = !result;
    const cloudModel = element("stt-model").value.startsWith("deepgram-");
    element("deepgram-consent").hidden = !cloudModel;
    element("stt-cloud-consent").disabled = pending || !cloudModel;
    element("stt-evaluate").disabled =
      !result ||
      pending ||
      !element("stt-verified").checked ||
      !element("stt-expected").value.trim() ||
      (cloudModel && !element("stt-cloud-consent").checked);
    element("stt-model").disabled = pending;
    element("stt-expected").disabled = pending;
    element("stt-verified").disabled = pending;
    onChange(Boolean(active) || pending);
  };
  const download = (body, type, name) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stop = async () => {
    if (!active || pending) return;
    pending = true;
    render();
    const recording = active;
    active = undefined;
    try {
      const wav = await recording.stop();
      const id = "mic-" + Date.now();
      result = { id, wav };
      element("stt-verified").checked = false;
      element("stt-cloud-consent").checked = false;
      element("stt-result").hidden = true;
      element("stt-record-status").textContent =
        `Captura completa: ${((wav.byteLength - 44) / 32000).toFixed(2)} s. Ouça o WAV e confira a transcrição esperada.`;
    } catch (error) {
      element("stt-record-status").textContent = error.message;
    } finally {
      pending = false;
      render();
    }
  };
  const evaluate = async () => {
    if (!result || pending) return;
    if (!element("stt-verified").checked) {
      element("stt-record-status").textContent =
        "Confira o WAV e marque que a transcrição esperada está correta.";
      return;
    }
    if (
      element("stt-model").value.startsWith("deepgram-") &&
      !element("stt-cloud-consent").checked
    ) {
      element("stt-record-status").textContent =
        "Confirme o envio desta gravação ao Deepgram antes do teste.";
      return;
    }
    pending = true;
    element("stt-result").hidden = true;
    element("stt-record-status").textContent =
      "Transcrevendo com o modelo selecionado…";
    render();
    try {
      const output = await evaluateSpeechToText({
        model: element("stt-model").value,
        wav: result.wav,
        expected: element("stt-expected").value.trim(),
        confirmCloudUpload: element("stt-cloud-consent").checked,
      });
      const report = element("stt-result");
      report.replaceChildren();
      const summary = document.createElement("p");
      summary.textContent =
        `${output.model} · WER ${(output.wer * 100).toFixed(1)}% · ` +
        `${output.wordErrors}/${output.referenceWords} erros de palavra · ` +
        `${(output.durationMs / 1000).toFixed(2)} s` +
        (output.confidence === null
          ? ""
          : ` · confiança ${(output.confidence * 100).toFixed(1)}%`);
      const transcript = document.createElement("p");
      transcript.textContent = `Reconhecido: ${output.transcript || "(nenhuma fala reconhecida)"}`;
      report.append(summary, transcript);
      report.hidden = false;
      element("stt-record-status").textContent =
        "Teste concluído. O WER compara a transcrição com o texto conferido.";
    } catch (error) {
      element("stt-record-status").textContent =
        error.message || "Não foi possível avaliar esta gravação.";
    } finally {
      if (element("stt-model").value.startsWith("deepgram-"))
        element("stt-cloud-consent").checked = false;
      pending = false;
      render();
    }
  };
  element("stt-record").addEventListener("click", async () => {
    if (!canRecord() || active || pending) return;
    pending = true;
    result = undefined;
    render();
    try {
      active = await startSampleRecording(stop);
      element("stt-record-status").textContent =
        "Gravando. Diga a frase e clique em Parar. Limite de 30 segundos.";
    } catch (error) {
      element("stt-record-status").textContent = error.message;
    } finally {
      pending = false;
      render();
    }
  });
  element("stt-stop").addEventListener("click", stop);
  element("stt-evaluate").addEventListener("click", evaluate);
  element("stt-model").addEventListener("change", render);
  element("stt-verified").addEventListener("change", render);
  element("stt-cloud-consent").addEventListener("change", render);
  element("stt-expected").addEventListener("input", render);
  element("stt-wav").addEventListener("click", () => {
    if (result) download(result.wav, "audio/wav", result.id + ".wav");
  });
  element("stt-manifest").addEventListener("click", () => {
    if (!result) return;
    const expected = element("stt-expected").value.trim();
    if (!expected) {
      element("stt-record-status").textContent =
        "Informe a fala correta antes de baixar o manifesto.";
      return;
    }
    const manifest = {
      corpusKind: "real-microphone",
      referenceVerified: element("stt-verified").checked,
      cases: [{ id: result.id, file: result.id + ".wav", expected }],
    };
    download(
      JSON.stringify(manifest, null, 2),
      "application/json",
      result.id + ".json",
    );
  });
  window.addEventListener("pagehide", () => {
    void active?.dispose();
  });
  render();
  return render;
}
