import { ExpressionSchema } from '../../domain/persona/expression.ts';
import { z } from 'zod';

export const ShotBankSchema = z
  .object({
    version: z.literal(1),
    levels: z.record(z.string(), z.array(z.string())),
    shots: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(['style-adaptation', 'synthetic-memory-contract']),
          sourceIds: z.array(z.string()),
          facts: z.array(z.string()),
          messages: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string(),
              }),
            )
            .min(2),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .superRefine((bank, ctx) => {
    if (new Set(bank.shots.map((s) => s.id)).size !== bank.shots.length) {
      ctx.addIssue({ code: 'custom', message: 'Exemplos duplicados.' });
    }

    for (const ids of Object.values(bank.levels)) {
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !bank.shots.some((s) => s.id === id))
      ) {
        ctx.addIssue({ code: 'custom', message: 'Nível inválido.' });
      }
    }

    for (const shot of bank.shots) {
      if (shot.kind === 'style-adaptation' && !shot.sourceIds.length) {
        ctx.addIssue({ code: 'custom', message: 'Adaptação sem origem.' });
      }

      for (const [index, message] of shot.messages.entries()) {
        if (message.role !== (index % 2 ? 'assistant' : 'user')) {
          ctx.addIssue({ code: 'custom', message: 'Alternância inválida.' });
        }

        if (message.role !== 'assistant') {
          continue;
        }

        try {
          const match = /^<expression>(.*?)<\/expression>\s*\S/su.exec(
            message.content,
          );

          if (!match) {
            throw new Error('Cabeçalho ausente.');
          }

          const value = JSON.parse(match[1]!);
          ExpressionSchema.parse({
            intent: value.intent,
            emotion: value.emotion,
            intensity: value.intensity,
          });
          const indices = Array.isArray(value.memory)
            ? value.memory
            : value.memory?.facts;

          if (
            !Array.isArray(indices) ||
            indices.some(
              (i: unknown) =>
                !Number.isInteger(i) ||
                Number(i) < 0 ||
                Number(i) >= shot.facts.length,
            )
          ) {
            throw new Error('Referência inválida.');
          }
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Contrato expressivo/de memória inválido.',
          });
        }
      }
    }
  });

export function normalizeScenarioCases(
  value: unknown,
): Record<string, unknown>[] {
  const cases = Array.isArray(value)
    ? value
    : (value as { value?: unknown })?.value;

  if (
    !Array.isArray(cases) ||
    !cases.every((c) => c && typeof c.id === 'string' && Array.isArray(c.turns))
  ) {
    throw new Error('Conjunto inválido.');
  }

  return cases;
}

export function parseScenarioDataset(text: string) {
  const dataset = JSON.parse(text.replace(/^\uFEFF/u, ''));

  return { ...dataset, cases: normalizeScenarioCases(dataset.cases) };
}

export function demonstrationMessages(
  bank: z.infer<typeof ShotBankSchema>,
  level: string,
) {
  const ids = bank.levels[level];

  if (!ids) {
    throw new Error('Nível de exemplos desconhecido.');
  }

  return ids.flatMap((id) => {
    const shot = bank.shots.find((s) => s.id === id)!;

    return shot.messages.map((m, index) => ({
      ...m,
      content:
        index === 0 && shot.facts.length
          ? 'Demonstração fictícia independente. Fatos somente deste exemplo: ' +
            JSON.stringify(shot.facts) +
            '.\n' +
            m.content
          : m.content,
    }));
  });
}

/** Only evaluation replaces the acting core; factual/output contracts stay intact. */
export function buildExperimentalMessages(input: {
  variant: string;
  originalCore: string;
  card: string;
  direction: string;
  system: string;
  history: { role: string; content: string }[];
  content: string;
  bank: z.infer<typeof ShotBankSchema>;
  level: string;
}) {
  if (!['current', 'card', 'card-shots'].includes(input.variant)) {
    throw new Error('Braço desconhecido.');
  }

  if (!input.system.includes(input.originalCore)) {
    throw new Error('Núcleo não encontrado.');
  }

  const system =
    (input.variant === 'current'
      ? input.system
      : input.system.replace(input.originalCore, input.card)) +
    '\n' +
    input.direction;
  const shots =
    input.variant === 'card-shots'
      ? demonstrationMessages(input.bank, input.level)
      : [];

  return [
    { role: 'system', content: system },
    ...shots,
    ...input.history,
    { role: 'user', content: input.content },
  ];
}
