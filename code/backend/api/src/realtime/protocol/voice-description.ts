import { z } from 'zod';
import { ClientEvent } from './client-events.ts';
import { VoicePayload } from './voice-server-events.ts';
import { AUDIO_FORMAT } from './audio.ts';

export const VOICE_PIPELINE_PROTOCOL = {
  protocolVersion: '1.1',
  stage: 'voice',
  voicePipelineImplemented: true,
  clientEventSchema: z.toJSONSchema(ClientEvent),
  serverPayloadSchema: z.toJSONSchema(VoicePayload),
  serverEnvelope: {
    protocolVersion: '1.1',
    sessionId: 'UUID',
    seq: 'monotonically increasing integer',
  },
  audio: AUDIO_FORMAT,
  binaryAudio: {
    frameBytes: 648,
    headerBytes: 8,
    sequence: 'uint32 little-endian at offset 0; reset per utterance/segment',
    turnId: 'uint32 little-endian at offset 4',
    pcmBytes: 640,
    padding: 'Final output frame zero padded; sampleCount excludes padding',
    segmentAssociation:
      'audio.segment immediately precedes its contiguous binary frames',
  },
  inputLimits: {
    minimumSpeechMs: 100,
    maximumSpeechSeconds: 30,
    maximumJsonBytes: 8192,
    maximumControlEventsPerMinute: 600,
    maximumPlaybackAcknowledgementsPerMinute: 180,
    connectionTtlSeconds: 1800,
  },
  generation:
    'Gemini SSE to bounded sentence queue; TTS buffered per sentence; http-json uses buffered fallback',
  playback:
    'Monotonic playedSamples bound to session/response/segment; only fully acknowledged segments enter spoken context',
  privacy:
    'Unspecified dataClass defaults to personal; synthetic is for artificial fixtures only',
  resumptionImplemented: false,
};
