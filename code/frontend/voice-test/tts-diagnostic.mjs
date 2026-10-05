import { generateSpeech } from "./speech-evaluation-client.mjs";

export function attachTtsDiagnostic() {
  const element = (id) => document.getElementById(id);
  let objectUrl;
  let pending = false;
  const model = element("tts-model");
  const voiceField = element("cartesia-voice-field");
  const voiceId = element("cartesia-voice-id");
  const button = element("tts-generate");
  const audio = element("tts-audio");
  const status = element("tts-status");

  const render = () => {
    const cartesia = model.value === "cartesia-sonic-3.6";
    voiceField.hidden = !cartesia;
    element("cartesia-tts-consent").hidden = !cartesia;
    voiceId.disabled = pending || !cartesia;
    element("tts-cloud-consent").disabled = pending || !cartesia;
    button.disabled =
      pending ||
      !element("tts-text").value.trim() ||
      (cartesia && !element("tts-cloud-consent").checked);
    model.disabled = pending;
    element("tts-text").disabled = pending;
  };

  model.addEventListener("change", render);
  element("tts-text").addEventListener("input", render);
  element("tts-cloud-consent").addEventListener("change", render);
  button.addEventListener("click", async () => {
    const text = element("tts-text").value.trim();
    if (!text || pending) return;
    if (
      model.value === "cartesia-sonic-3.6" &&
      !element("tts-cloud-consent").checked
    ) {
      status.textContent = "Confirme o envio do texto ao Cartesia antes de gerar a amostra.";
      return;
    }
    pending = true;
    audio.hidden = true;
    audio.removeAttribute("src");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
    status.textContent = "Gerando áudio…";
    render();
    try {
      const result = await generateSpeech({
        model: model.value,
        text,
        voiceId: voiceId.value.trim(),
        apiUrl: element("api-url").value.trim(),
        apiToken: element("token").value,
        confirmCloudUpload: element("tts-cloud-consent").checked,
      });
      const binary = atob(result.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: "audio/wav" }),
      );
      audio.src = objectUrl;
      audio.hidden = false;
      status.textContent = `${result.model} · ${(result.durationMs / 1000).toFixed(2)} s de geração · ${(bytes.length / 1024).toFixed(0)} KiB · ${result.sampleRate} Hz.`;
    } catch (error) {
      status.textContent = error.message || "Não foi possível gerar a amostra.";
    } finally {
      if (model.value === "cartesia-sonic-3.6")
        element("tts-cloud-consent").checked = false;
      pending = false;
      render();
    }
  });

  window.addEventListener("pagehide", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
  render();
}
