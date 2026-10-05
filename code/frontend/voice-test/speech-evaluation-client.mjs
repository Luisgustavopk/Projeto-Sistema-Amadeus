export function wavToBase64(wav) {
  const bytes = new Uint8Array(wav);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function postEvaluation(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`A interface de teste retornou HTTP ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(result.error || `A avaliação falhou (HTTP ${response.status})`);
  }
  return result;
}

export function evaluateSpeechToText({
  model,
  wav,
  expected,
  confirmCloudUpload,
}) {
  return postEvaluation("/evaluation/stt", {
    model,
    wavBase64: wavToBase64(wav),
    expected,
    confirmCloudUpload,
  });
}

export function generateSpeech({
  model,
  text,
  voiceId,
  apiUrl,
  apiToken,
  confirmCloudUpload,
}) {
  const body = { model, text, voiceId };
  if (model === "qwen-base") {
    body.apiUrl = apiUrl;
    body.apiToken = apiToken;
  } else if (model.startsWith("cartesia-")) {
    body.confirmCloudUpload = confirmCloudUpload;
  }
  return postEvaluation("/evaluation/tts", body);
}
