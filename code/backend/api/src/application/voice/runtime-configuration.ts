import { z } from 'zod';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import type { ConfigurationGate } from '../../ports/activity-gate.ts';
import type { ProviderServices } from '../providers/index.ts';
import { conversationAuthor } from '../providers/conversation-author.ts';
import { ProviderBusyError } from '../../domain/errors/providers.ts';

export const VoiceRuntimeOptionsSchema = z.strictObject({
  expressionMode: z.enum(['embedded', 'parallel']).default('embedded'),
  firstFlushMs: z.union([z.literal(200), z.literal(700)]).default(700),
  observerTimeoutMs: z.number().int().min(100).max(3000).default(1500),
  // Explicit owner consent is separate from the conversation provider policy.
  observerPersonalConsent: z.boolean().default(false),
});
export const VoiceRuntimeStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  options: VoiceRuntimeOptionsSchema,
});
export const VoiceRuntimeEditSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  options: VoiceRuntimeOptionsSchema,
});
export type VoiceRuntimeOptions = z.infer<typeof VoiceRuntimeOptionsSchema>;

export function createVoiceRuntimeConfiguration(
  revisions: RevisionRepository,
  owner: string,
  gate: ConfigurationGate & { readonly activeCalls?: number },
  providers: Pick<ProviderServices, 'getConfiguration' | 'configure'>,
) {
  const key = `voice-runtime:${owner}`;
  const initial = { revision: 0, options: VoiceRuntimeOptionsSchema.parse({}) };

  return {
    async get() {
      const raw = await revisions.read(key);

      return raw
        ? VoiceRuntimeStateSchema.parse(JSON.parse(raw))
        : structuredClone(initial);
    },
    async configure(input: unknown) {
      const edit = VoiceRuntimeEditSchema.parse(input);
      const release = gate.beginConfiguration();

      try {
        const raw = await revisions.read(key);
        const current = raw
          ? VoiceRuntimeStateSchema.parse(JSON.parse(raw))
          : initial;

        if (current.revision !== edit.expectedRevision) {
          throw new ProviderBusyError(
            'O fluxo de voz mudou; consulte a revisão atual.',
          );
        }

        const next = { revision: current.revision + 1, options: edit.options };

        if (!(await revisions.compareAndSave(key, raw, JSON.stringify(next)))) {
          throw new ProviderBusyError('O fluxo de voz mudou simultaneamente.');
        }

        return next;
      } finally {
        release();
      }
    },
    async selectAuthor(author: 'llama' | 'deepseek') {
      const current = await providers.getConfiguration();

      if (gate.activeCalls) {
        throw new ProviderBusyError(
          'Encerre a chamada antes de escolher outro autor.',
        );
      }

      return providers.configure({
        ...current,
        llm: conversationAuthor(current.llm, author),
      });
    },
  };
}
