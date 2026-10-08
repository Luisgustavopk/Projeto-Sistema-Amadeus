import type { z } from 'zod';
import {
  ShotBankSchema,
  buildExperimentalMessages,
} from './experimental-suite.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../../application/persona/presence-reference.ts';
import { voiceOutputFormat } from '../../application/persona/voice-prompt.ts';

export const refinementVariants = [
  'baseline',
  'isolated',
  'acting',
  'grounded',
] as const;
export type RefinementVariant = (typeof refinementVariants)[number];

/** Evaluation-only factors. No language keyword matching or runtime rewriting. */
export function buildRefinementMessages(input: {
  variant: RefinementVariant;
  originalCore: string;
  card: string;
  direction: string;
  presence: string;
  system: string;
  history: { role: string; content: string }[];
  content: string;
  bank: z.infer<typeof ShotBankSchema>;
  memoryBlock: string;
  plain?: boolean;
}) {
  let bank = input.bank;

  if (input.variant !== 'baseline') {
    const shots = bank.shots.filter(
      (shot) => shot.kind === 'style-adaptation' && shot.facts.length === 0,
    );
    const eligible = new Set(shots.map((shot) => shot.id));
    bank = ShotBankSchema.parse({
      ...bank,
      shots,
      levels: Object.fromEntries(
        Object.entries(bank.levels).map(([level, ids]) => [
          level,
          ids.filter((id) => eligible.has(id)),
        ]),
      ),
    });
  }

  let system = input.system;

  if (input.variant === 'acting' || input.variant === 'grounded') {
    if (!system.includes(PERSONA_PRESENCE_REFERENCE)) {
      throw new Error('Complemento de atuação ausente.');
    }

    system = system.replace(
      PERSONA_PRESENCE_REFERENCE,
      `<persona_conversation_presence>\n${input.presence}\n</persona_conversation_presence>`,
    );
  }

  if (input.variant === 'grounded' && input.memoryBlock) {
    if (
      !system.includes(input.memoryBlock) ||
      system.split(input.memoryBlock).length !== 2
    ) {
      throw new Error('Bloco factual ausente ou duplicado.');
    }

    system = system.replace(input.memoryBlock, '');
  }

  if (input.plain) {
    if (input.memoryBlock) {
      throw new Error(
        'O protótipo sem cabeçalho não admite fatos persistentes.',
      );
    }

    const format = system.includes(voiceOutputFormat(0))
      ? voiceOutputFormat(0)
      : voiceOutputFormat(0, true);

    if (!system.includes(format)) {
      throw new Error('Contrato inicial de fala ausente.');
    }

    system = system.replace(
      format,
      '\nFORMATO: somente a fala da personagem em prosa, sem cabeçalho, rodapé, tags ou metadados.',
    );
  }

  const messages = buildExperimentalMessages({
    ...input,
    system,
    bank,
    variant: 'card-shots',
    level: '1',
  });

  if (input.plain) {
    for (const message of messages) {
      if (message.role === 'assistant') {
        message.content = message.content.replace(
          /^<expression>.*?<\/expression>\s*/su,
          '',
        );
      }
    }
  }

  if (input.variant === 'grounded' && input.memoryBlock) {
    messages.splice(messages.length - 1, 0, {
      role: 'system',
      content: input.memoryBlock,
    });
  }

  return messages;
}

/** Provenance is explicit: supplied model labels cannot become human calibration. */
export function requireHumanReference(reference: {
  evaluatorKind: string;
  personallyReviewed: boolean;
  blind: boolean;
}) {
  if (
    reference.evaluatorKind !== 'human' ||
    !reference.personallyReviewed ||
    !reference.blind
  ) {
    throw new Error('Referência humana cega e pessoalmente revisada pendente.');
  }
}

/** Retains raw output before parsing; failures never erase paid generations. */
export async function recordVerdict<T>(
  source: AsyncIterable<string>,
  parse: (text: string) => T,
  target: { raw: string; verdict: T | null; error: string | null },
  persist: () => Promise<void>,
) {
  try {
    for await (const chunk of source) {
      target.raw += chunk;
    }

    target.verdict = parse(target.raw);
  } catch (error) {
    target.error = error instanceof Error ? error.name : 'UnknownError';
  } finally {
    await persist();
  }
}
