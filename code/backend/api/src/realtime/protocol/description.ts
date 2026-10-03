import { SESSION_LIMITS } from './limits.ts';
import { z } from 'zod';
import { AUDIO_FORMAT } from './audio.ts';
import { ClientEvent } from './client-events.ts';
import { ServerEvent } from './server-events.ts';

export const VOICE_PROTOCOL = {
  protocolVersion: '1.0',
  stage: 'foundation',
  voicePipelineImplemented: false,
  clientEventSchema: z.toJSONSchema(ClientEvent),
  serverEventSchema: z.toJSONSchema(ServerEvent),
  url: '/v1/conversations/:id/call?ticket=<temporary-ticket>',
  authentication: {
    issuance:
      'POST /v1/conversations/:id/call-tickets with Bearer token and body {origin}',
    singleUse: true,
    maximumTtlSeconds: 120,
    boundTo: ['owner', 'conversation', 'credential', 'origin'],
    reconnection:
      'Obtain a new ticket for every connection. Playback/context resumption is not implemented in phase 0.',
  },
  negotiation: {
    firstEvent: 'session.start',
    deadlineMs: SESSION_LIMITS.negotiationDeadlineMs,
    audio: AUDIO_FORMAT,
  },
  implementedClientEvents: ['session.start', 'ping', 'session.end'],
  implementedServerEvents: ['session.ready', 'pong', 'session.closed', 'error'],
  binaryAudio: {
    acceptedInPhaseZero: false,
    futureFrame: {
      byteOrder: 'little-endian',
      headerBytes: 8,
      sequence: 'uint32 at offset 0',
      turnId: 'uint32 at offset 4',
      pcmBytesPerFrame: 640,
    },
    sequenceStartsAt: 0,
    maximumPendingFrames: 50,
  },
  futureEvents: [
    'audio.start',
    'audio.end',
    'transcript.partial',
    'transcript.final',
    'response.start',
    'response.segment',
    'response.cancel',
    'playback.ack',
    'state',
    'resume',
  ],
  futureStates: {
    connection: ['connecting', 'connected', 'reconnecting', 'closed'],
    turn: ['idle', 'listening', 'thinking', 'speaking', 'cancelling', 'error'],
  },
  resumption: {
    implemented: false,
    futureIdentifiers: [
      'sessionId',
      'turnId',
      'responseId',
      'segmentId',
      'sequence',
    ],
    discardCancelledAudio: true,
  },
  limits: {
    maximumJsonBytes: SESSION_LIMITS.maximumJsonBytes,
    maximumEventsPerMinute: SESSION_LIMITS.maximumEventsPerMinute,
    foundationConnectionTtlSeconds: SESSION_LIMITS.connectionTtlMs / 1000,
  },
  closeCodes: {
    normal: 1000,
    policyOrVersion: 1008,
    payload: 1009,
    internal: 1011,
  },
} as const;
