export async function openCall({
  apiUrl,
  credential,
  conversationId,
  resume,
  dataClass = "personal",
}) {
  if (resume && !conversationId) {
    throw new Error("Retomada exige a conversa anterior.");
  }
  const base = new URL(apiUrl);
  if (
    base.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  ) {
    throw new Error("Remote API requires HTTPS");
  }
  const request = async (path, payload) => {
    const result = await fetch(new URL(path, base), {
      method: "POST",
      headers: {
        authorization: "Bearer " + credential,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) {
      throw new Error("API request failed: " + result.status);
    }
    return result.json();
  };
  const id = conversationId ?? (await request("/v1/conversations", {})).id;
  const { ticket } = await request(
    "/v1/conversations/" + encodeURIComponent(id) + "/call-tickets",
    { origin: location.origin },
  );
  const url = new URL(
    "/v1/conversations/" + encodeURIComponent(id) + "/call",
    base,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket connection timeout"));
    }, 10000);
    const finish = (error) => {
      clearTimeout(timeout);
      if (error) {
        socket.close();
        reject(error);
      } else {
        resolve();
      }
    };
    socket.onopen = () => finish();
    socket.onerror = () => finish(new Error("WebSocket connection failed"));
    socket.onclose = () => finish(new Error("Connection closed before negotiation"));
  });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Voice negotiation timeout"));
    }, 5000);
    socket.onmessage = (event) => {
      try {
        const value = JSON.parse(event.data);
        if (value.type !== "session.ready" || value.protocolVersion !== "1.1") {
          throw new Error("Unexpected negotiation");
        }
        clearTimeout(timeout);
        resolve(value);
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      reject(new Error("Connection closed during negotiation"));
    };
  });
  socket.send(
    JSON.stringify({
      type: resume ? "session.resume" : "session.start",
      ...(resume
        ? { previousSessionId: resume.previousSessionId, lastSeq: resume.lastSeq }
        : {}),
      protocolVersion: "1.1",
      dataClass,
      audio: {
        codec: "pcm_s16le",
        sampleRate: 16000,
        channels: 1,
        frameDurationMs: 20,
      },
    }),
  );
  const session = await ready;
  return { socket, conversationId: id, session };
}
