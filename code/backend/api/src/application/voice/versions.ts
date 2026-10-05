import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import type { ProviderServices } from '../providers/index.ts';
import type { VoiceProfiles } from './profiles.ts';
import { ProviderSchema } from '../../domain/providers/model.ts';
import {
  ProviderBusyError,
  ProviderConfigurationError,
} from '../../domain/errors/providers.ts';
import { PERSONA_VERSION } from '../../domain/persona/expression.ts';
import type { ConfigurationGate } from '../../ports/activity-gate.ts';

export const VoiceVersionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  createdAt: z.iso.datetime(),
  personaVersion: z.string(),
  reference: z
    .object({
      id: z.string(),
      name: z.string(),
      referenceFile: z.string(),
      referenceSha256: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  tts: ProviderSchema,
  deliveryApplied: z.literal(false),
  presets: z.array(z.string()),
  synthesis: z.object({
    codec: z.literal('pcm_s16le'),
    sampleRate: z.union([z.literal(16000), z.literal(24000)]),
    channels: z.literal(1),
    language: z.literal('pt'),
    accent: z.string().nullable(),
    maxSegmentCharacters: z.literal(220),
  }),
});

export function createVoiceVersions(
  repository: RevisionRepository,
  owner: string,
  providers: Pick<ProviderServices, 'getConfiguration' | 'configureTts'>,
  profiles: Pick<VoiceProfiles, 'active'>,
  gate: ConfigurationGate,
) {
  const key = `voice-versions:${owner}`;
  const schema = z.array(VoiceVersionSchema).max(256);

  return {
    async list() {
      const raw = await repository.read(key);

      return raw ? schema.parse(JSON.parse(raw)) : [];
    },
    async capture(name: string) {
      const release = gate.beginConfiguration();

      try {
        const raw = await repository.read(key);
        const versions = raw ? schema.parse(JSON.parse(raw)) : [];
        const config = await providers.getConfiguration();
        const reference = await profiles.active();

        if (config.tts.adapter === 'http-json' && !reference) {
          throw new ProviderConfigurationError(
            'Ative a referência local antes de salvar uma versão.',
          );
        }

        if (config.tts.adapter === 'disabled') {
          throw new ProviderConfigurationError(
            'Configure a voz antes de salvar uma versão.',
          );
        }

        const version = VoiceVersionSchema.parse({
          id: randomUUID(),
          name,
          createdAt: new Date().toISOString(),
          personaVersion: PERSONA_VERSION,
          reference,
          tts: config.tts,
          synthesis: {
            codec: 'pcm_s16le',
            sampleRate: config.tts.adapter === 'cartesia' ? 24000 : 16000,
            channels: 1,
            language: 'pt',
            accent:
              config.tts.adapter === 'cartesia' ? 'brazilian-portuguese' : null,
            maxSegmentCharacters: 220,
          },
          deliveryApplied: false,
          presets: [
            'neutro_claro_v1',
            'seco_suave_v1',
            'hesitante_baixo_v1',
            'acolhedor_calmo_v1',
          ],
        });
        const next = schema.parse([...versions, version]);

        if (
          !(await repository.compareAndSave(key, raw, JSON.stringify(next)))
        ) {
          throw new ProviderBusyError(
            'Outra versão vocal foi salva; tente novamente.',
          );
        }

        return version;
      } finally {
        release();
      }
    },
    async restore(id: string) {
      const raw = await repository.read(key);
      const version = (raw ? schema.parse(JSON.parse(raw)) : []).find(
        (v) => v.id === id,
      );

      if (!version) {
        throw new ProviderConfigurationError('Versão vocal não encontrada.');
      }

      await providers.configureTts(version.tts, async () => {
        const active = await profiles.active();

        if (
          version.tts.adapter === 'http-json' &&
          (!active ||
            active.referenceSha256 !== version.reference?.referenceSha256)
        ) {
          throw new ProviderConfigurationError(
            'Ative primeiro a referência original dessa versão.',
          );
        }
      });

      return version;
    },
  };
}
