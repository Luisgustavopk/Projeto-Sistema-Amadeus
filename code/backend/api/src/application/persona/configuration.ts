import { z } from 'zod';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import { ProviderBusyError } from '../../domain/errors/providers.ts';
import { PERSONA_VERSION } from '../../domain/persona/expression.ts';

export const PersonaEditSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  direction: z
    .string()
    .max(2000)
    .refine(
      (text) =>
        !/<\/?(?:expression|amadeus_conversation_skill|persona_document_reference)>/iu.test(
          text,
        ),
      'Tags técnicas não são permitidas.',
    ),
});
export const PersonaConfigurationSchema = z.object({
  version: z.string(),
  revision: z.number().int().nonnegative(),
  direction: z.string(),
  updatedAt: z.iso.datetime().nullable(),
});
export type PersonaConfiguration = z.infer<typeof PersonaConfigurationSchema>;

export function createPersonaConfiguration(
  repository: RevisionRepository,
  owner: string,
) {
  const key = `persona:${owner}`;
  const initial: PersonaConfiguration = {
    version: PERSONA_VERSION,
    revision: 0,
    direction: '',
    updatedAt: null,
  };

  return {
    async get(): Promise<PersonaConfiguration> {
      const raw = await repository.read(key);

      return raw
        ? {
            ...PersonaConfigurationSchema.parse(JSON.parse(raw)),
            version: PERSONA_VERSION,
          }
        : { ...initial };
    },
    async update(input: z.infer<typeof PersonaEditSchema>) {
      const edit = PersonaEditSchema.parse(input);
      const raw = await repository.read(key);
      const current = raw
        ? PersonaConfigurationSchema.parse(JSON.parse(raw))
        : initial;

      if (edit.expectedRevision !== current.revision) {
        throw new ProviderBusyError(
          'A persona foi alterada; consulte a versão atual.',
        );
      }

      const next = {
        version: PERSONA_VERSION,
        revision: current.revision + 1,
        direction: edit.direction.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (!(await repository.compareAndSave(key, raw, JSON.stringify(next)))) {
        throw new ProviderBusyError('A persona foi alterada simultaneamente.');
      }

      return next;
    },
  };
}

export function applyPersonaConfiguration(
  prompt: string,
  config?: PersonaConfiguration,
) {
  if (!config?.direction) {
    return prompt;
  }

  // Preserve the structured contract and keep admin style direction separate
  // from the user's conversation and from the final expression format.
  const boundary = '\nEXPRESSÃO:';
  const index = prompt.indexOf(boundary);
  const addition = `\nDIREÇÃO ADMINISTRATIVA DE ESTILO — revisão ${config.revision}:\nComplemento de estilo subordinado à identidade, honestidade, política de dados e formato técnico existentes.\n${config.direction}\n`;

  return index < 0
    ? prompt + addition
    : prompt.slice(0, index) + addition + prompt.slice(index);
}
