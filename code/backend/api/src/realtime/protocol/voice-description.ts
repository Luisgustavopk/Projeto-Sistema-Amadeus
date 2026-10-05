import { z } from 'zod';
import { ClientEvent } from './client-events.ts';
import { VoicePayload } from './voice-server-events.ts';
import { AUDIO_FORMAT } from './audio.ts';
import { PERSONA_VERSION } from '../../domain/persona/expression.ts';

export const VOICE_PIPELINE_PROTOCOL = {
  protocolVersion: '1.1',
  stage: 'voice',
  voicePipelineImplemented: true,
  persona: {
    version: PERSONA_VERSION,
    narrativeCutoff:
      'pre-Japan, approximately March 2010; fictional characterization',
    expressionEvent: 'reply.expression',
    association:
      'Cache expression by responseId/segmentId; apply on actual segment playback, not event arrival',
    stateScope: 'current voice session; reset on reconnect',
    nativeDeliveryControlsApplied: false,
  },
  clientEventSchema: z.toJSONSchema(ClientEvent),
  serverPayloadSchema: z.toJSONSchema(VoicePayload),
  serverEnvelope: {
    protocolVersion: '1.1',
    sessionId: 'UUID',
    seq: 'monotonically increasing integer',
  },
  audio: AUDIO_FORMAT,
  outputAudio: {
    codec: 'pcm_s16le',
    channels: 1,
    sampleRates: [16000, 24000],
    frameDurationMs: 20,
    rateSource: 'audio.segment.sampleRate',
  },
  binaryAudio: {
    frameBytes: 648, // Input; output is 8 + sampleRate / 50 * 2.
    outputFrameBytes: [648, 968],
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
    'LLM stream to bounded speech blocks up to 220 characters; short replies synthesized together; TTS buffered per block',
  playback:
    'Monotonic playedSamples bound to session/response/segment; only fully acknowledged segments enter spoken context',
  privacy:
    'Unspecified dataClass defaults to personal; synthetic is for artificial fixtures only',
  resumptionImplemented: false,
};
