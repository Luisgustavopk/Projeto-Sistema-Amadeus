import { z } from 'zod';
import type { RevisionRepository } from '../../ports/revision-repository.ts';
import type { DataClass } from '../../domain/providers/model.ts';
import {
  ExpressionSchema,
  EMOTION_PRESENTATIONS,
  type Expression,
} from '../../domain/persona/expression.ts';
import { ProviderBusyError } from '../../domain/errors/providers.ts';

const axis = z.number().finite().min(-1).max(1);
export const PersonaStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  pleasure: axis,
  arousal: axis,
  dominance: axis,
  energy: z.number().finite().min(0).max(1),
  interactions: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastResponseIds: z.array(z.string().max(64)).max(32),
});
export type PersonaState = z.infer<typeof PersonaStateSchema>;
const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Artistic controls, not emotions/diagnoses about the person. No model call.
export function createPersistentPersonaState(
  repository: RevisionRepository,
  owner: string,
  now = Date.now,
) {
  const initial = (): PersonaState => ({
    revision: 0,
    pleasure: 0,
    arousal: 0,
    dominance: 0,
    energy: 0.65,
    interactions: 0,
    updatedAt: now(),
    lastResponseIds: [],
  });
  const key = (dataClass: DataClass) => `persona-state:${owner}:${dataClass}`;

  const decay = (state: PersonaState): PersonaState => {
    const elapsed = Math.max(0, now() - state.updatedAt);
    const weight = Math.pow(0.5, elapsed / (6 * 60 * 60 * 1000));

    return {
      ...state,
      pleasure: round(state.pleasure * weight),
      arousal: round(state.arousal * weight),
      dominance: round(state.dominance * weight),
      energy: round(0.65 + (state.energy - 0.65) * weight),
    };
  };

  async function read(dataClass: DataClass) {
    const raw = await repository.read(key(dataClass));

    return {
      raw,
      state: raw ? PersonaStateSchema.parse(JSON.parse(raw)) : initial(),
    };
  }

  async function mutate(
    dataClass: DataClass,
    change: (state: PersonaState) => PersonaState,
  ) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { raw, state } = await read(dataClass);
      const next = PersonaStateSchema.parse({
        ...change(decay(state)),
        revision: state.revision + 1,
        updatedAt: now(),
      });

      if (
        await repository.compareAndSave(
          key(dataClass),
          raw,
          JSON.stringify(next),
        )
      ) {
        return next;
      }
    }

    throw new ProviderBusyError(
      'O estado da persona foi atualizado simultaneamente.',
    );
  }

  return {
    async snapshot(dataClass: DataClass) {
      const { state } = await read(dataClass);
      const view = PersonaStateSchema.omit({ lastResponseIds: true })
        .strip()
        .parse(decay(state));

      return {
        ...view,
        familiarity:
          state.interactions >= 10
            ? ('F2' as const)
            : state.interactions >= 3
              ? ('F1' as const)
              : ('F0' as const),
      };
    },
    async observe(
      dataClass: DataClass,
      responseId: string,
      expression: Expression,
    ) {
      const parsed = ExpressionSchema.parse(expression);

      return mutate(dataClass, (state) => {
        if (state.lastResponseIds.includes(responseId)) {
          return state;
        }

        const target = EMOTION_PRESENTATIONS[parsed.emotion].pad;
        const weight = Math.min(0.25, parsed.intensity * 0.35);
        const move = (current: number, desired: number) =>
          round(
            clamp(
              current + clamp((desired - current) * weight, -0.08, 0.08),
              -0.4,
              0.4,
            ),
          );

        return {
          ...state,
          pleasure: move(state.pleasure, target[0]),
          arousal: move(state.arousal, target[1]),
          dominance: move(state.dominance, target[2]),
          energy: round(clamp(state.energy - 0.005, 0.35, 0.85)),
          interactions: state.interactions + 1,
          lastResponseIds: [...state.lastResponseIds, responseId].slice(-32),
        };
      });
    },
    reset(dataClass: DataClass) {
      return mutate(dataClass, () => initial());
    },
  };
}

export type PersistentPersonaState = ReturnType<
  typeof createPersistentPersonaState
>;
