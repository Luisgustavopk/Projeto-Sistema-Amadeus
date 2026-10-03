import type { FastifyRequest } from 'fastify';
import type { VoiceHttpServices } from '../dependencies.ts';

export function createVoiceProfileController(services: VoiceHttpServices) {
  return {
    get: async () => ({ profile: await services.voiceProfiles.active() }),
    activate: async (
      request: FastifyRequest<{
        Body: { name: string; referenceFile: string; consentConfirmed: true };
      }>,
    ) => ({ profile: await services.voiceProfiles.activate(request.body) }),
  };
}
