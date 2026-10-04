import { startSampleRecording } from "./stt-sample.mjs";

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
      element("stt-record-status").textContent =
        `Captura completa: ${((wav.byteLength - 44) / 32000).toFixed(2)} s. Ouça o WAV e confira a transcrição esperada.`;
    } catch (error) {
      element("stt-record-status").textContent = error.message;
    } finally {
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
