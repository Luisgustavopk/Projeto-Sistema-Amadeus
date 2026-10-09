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
    stateScope:
      'segment expression within the session; bounded artistic PAD/energy and familiarity persist per owner/data class with decay',
    nativeDeliveryControlsApplied: false,
    parallelExpression:
      'Optional observer emits initial/update events for the same segment; audio never waits for expression classification. Personal observation requires explicit consent.',
    authorSelection:
      'Manual configured/Llama/DeepSeek selection before opening a call; semantic selection by Jev is not enabled.',
  },
  clientEventSchema: z.toJSONSchema(ClientEvent),
  presence: {
    handshake:
      'presence.update -> presence.offer -> presence.accept/decline; client reserves the next shared turn ID',
    greetingOnce: true,
    silenceMs: 90000,
    minimumIntervalMs: 180000,
    maximumInitiativesPerSession: 2,
    userPriority: true,
    externalAutonomy: false,
  },
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
    rateSource: 'audio.segment.sampleRate or audio.start.sampleRate',
    progressiveAudio:
      'audio.start precedes PCM; audio.end supplies final sampleCount/frameCount before the padded tail; audio.abort discards an unfinished stream',
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
      'audio.segment or audio.start immediately precedes its contiguous binary frames',
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
  providerFallback: {
    waitEvent: 'reply.wait',
    waitScope:
      'At most once per turn; optional preset uses normal text/audio segments',
    continuation:
      'One bounded recovery after quota/temporary failure; already emitted speech is passed as continuation context',
    preserves:
      'turnId, responseId, data classification, provider policies and budgets',
  },
  playback:
    'Monotonic playedSamples bound to session/response/segment; only fully acknowledged segments enter spoken context',
  privacy:
    'Unspecified dataClass defaults to personal; synthetic is for artificial fixtures only',
  resumptionImplemented: true,
  resumption:
    'Fresh one-use ticket for the same owned conversation; session.resume validates the previous session; context restored from persistence, no replay of old audio or resubmission of interrupted utterances. lastSeq is diagnostic, not an event replay cursor.',
};
