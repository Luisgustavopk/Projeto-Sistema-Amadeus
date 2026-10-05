export const PROVIDER_PROTOCOL = {
  protocolVersion: '1.0',
  transport: 'buffered-json',
  endpoints: {
    health: {
      method: 'GET',
      path: '/health',
      response: {
        protocolVersion: '1.0',
        role: 'llm | stt | tts',
        status: 'ok',
        capabilities: {
          incrementalGeneration: false,
          progressiveDelivery: false,
          vision: false,
          customVoice: false,
          testedVoiceControls: [],
        },
      },
    },
    execute: {
      method: 'POST',
      path: '/execute',
      request: {
        protocolVersion: '1.0',
        role: 'llm | stt | tts',
        model: 'string | null',
        content: 'string',
        dataClass: 'synthetic | personal | local-only',
        audio: 'STT: {pcmBase64, sampleRate:16000, channels:1}',
        voice: 'TTS: {id, referenceFile, referenceSha256}',
        maxTokens: 'integer',
      },
      response: {
        content: 'string',
        inputTokens: 'integer | null',
        outputTokens: 'integer | null',
        audio: 'TTS: optional {pcmBase64, sampleRate:16000|24000, channels:1}',
      },
    },
  },
  limits: {
    healthTimeoutMs: 10000,
    llmTimeoutMs: 30000,
    speechTimeoutMs: 90000,
    responseBytes: 131072,
    ttsResponseBytes: 4194304,
  },
  authorization: 'Bearer from apiKeyEnv, if configured',
  nativeStreaming: false,
};
