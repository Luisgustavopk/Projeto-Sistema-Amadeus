import { randomUUID } from 'node:crypto';
import type {
  VoiceProfileRepository,
  VoiceReferenceInspector,
} from '../../ports/voice-profile-repository.ts';
import type { ConfigurationGate } from '../../ports/activity-gate.ts';
import { VoiceInputError } from '../../domain/errors/voice.ts';

export function createVoiceProfiles(
  repository: VoiceProfileRepository,
  inspector: VoiceReferenceInspector,
  gate: ConfigurationGate,
  ownerId: string,
) {
  return {
    active: () => repository.active(ownerId),
    async activate(input: {
      name: string;
      referenceFile: string;
      consentConfirmed: boolean;
    }) {
      if (!input.consentConfirmed) {
        throw new VoiceInputError(
          'Confirme a autorização de uso da referência.',
        );
      }

      if (!input.name.trim() || input.name.trim().length > 80) {
        throw new VoiceInputError(
          'O perfil exige um nome entre 1 e 80 caracteres.',
        );
      }

      const release = gate.beginConfiguration();

      try {
        const reference = await inspector.inspect(input.referenceFile);
        const profile = {
          id: randomUUID(),
          name: input.name.trim(),
          referenceFile: input.referenceFile,
          referenceSha256: reference.sha256,
          createdAt: new Date().toISOString(),
        };
        await repository.activate(ownerId, profile);

        return profile;
      } finally {
        release();
      }
    },
  };
}

export type VoiceProfiles = ReturnType<typeof createVoiceProfiles>;
