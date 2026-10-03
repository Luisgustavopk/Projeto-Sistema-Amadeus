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
        dataClass: 'synthetic | personal',
        maxTokens: 'integer',
      },
      response: {
        content: 'string',
        inputTokens: 'integer | null',
        outputTokens: 'integer | null',
      },
    },
  },
  limits: { timeoutMs: 10000, responseBytes: 131072 },
  authorization: 'Bearer from apiKeyEnv, if configured',
  nativeStreaming: false,
};
