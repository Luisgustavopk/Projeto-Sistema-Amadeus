import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ExpressionSchema,
  NEUTRAL_EXPRESSION,
  describeDelivery,
} from '../../src/domain/persona/expression.ts';
import { createExpressionState } from '../../src/domain/persona/expression-policy.ts';
import { readPersonaResponse } from '../../src/application/persona/response-stream.ts';
import { VoicePayload } from '../../src/realtime/protocol/voice-server-events.ts';
import { createPersistentPersonaState } from '../../src/application/persona/persistent-state.ts';
import {
  voiceOutputFormat,
  buildVoicePersonaPrompt,
} from '../../src/application/persona/voice-prompt.ts';
import { buildPersonaPrompt } from '../../src/application/persona/prompt.ts';
import { buildCompactPersonaPrompt } from '../../src/application/persona/compact-prompt.ts';
import { expressionDeliveryReview } from '../../src/evaluation/persona/controlled-refinement.ts';

it('preserves new labels and full intensity from a split stream through the voice protocol', async () => {
  const expected = {
    intent: 'brincadeira',
    emotion: 'orgulho',
    intensity: 1,
  } as const;
  const header = `<expression>${JSON.stringify(expected)}</expression>`;

  for (let split = 0; split <= header.length; split++) {
    const state = createExpressionState();
    let valid = false;
    let speech = '';

    for await (const chunk of readPersonaResponse(
      (async function* () {
        yield header.slice(0, split);
        yield header.slice(split) + 'Essa eu acertei.';
      })(),
      (expression, accepted) => {
        valid = accepted;
        state.accept(expression);
      },
    )) {
      speech += chunk;
    }

    expect(speech).toBe('Essa eu acertei.');
    expect(valid).toBe(true);
    expect(state.snapshot()).toEqual(expected);
    const event = VoicePayload.parse({
      type: 'reply.expression',
      ...state.snapshot(),
      ...describeDelivery(state.snapshot()),
      turnId: 1,
      responseId: randomUUID(),
      segmentId: randomUUID(),
      position: 0,
      personaVersion: 'test',
      voiceProfileId: null,
      metadataValid: valid,
      deliveryApplied: false,
    });
    expect(event).toMatchObject({ ...expected, deliveryApplied: false });
  }
});

it('permits escalation, repeated irritation and immediate recomposition without label overrides', () => {
  const state = createExpressionState();
  const sequence = [
    { intent: 'limitar', emotion: 'irritacao', intensity: 0.4 },
    { intent: 'recusar', emotion: 'raiva', intensity: 0.9 },
    { intent: 'recusar', emotion: 'raiva', intensity: 1 },
    { intent: 'reconciliar', emotion: 'alivio', intensity: 0.25 },
    { intent: 'brincadeira', emotion: 'constrangimento', intensity: 0.1 },
    { intent: 'alertar', emotion: 'preocupacao', intensity: 0.5 },
    { intent: 'conversar', emotion: 'neutra', intensity: 0 },
  ];

  for (const expression of sequence) {
    expect(state.accept(expression)).toEqual(expression);
  }

  for (const intensity of [-0.1, 1.1, NaN, Infinity]) {
    expect(
      state.accept({ intent: 'reagir', emotion: 'surpresa', intensity }),
    ).toEqual(NEUTRAL_EXPRESSION);
  }
});

it('uses the same vocabulary and range in every current prompt path', () => {
  for (const prompt of [
    voiceOutputFormat(),
    buildVoicePersonaPrompt(),
    buildPersonaPrompt(),
    buildCompactPersonaPrompt(),
  ]) {
    expect(prompt).toContain('Intensidade contínua de 0 a 1');
    expect(prompt).not.toContain('Intensidade até 0.7');

    for (const label of [
      ...ExpressionSchema.shape.intent.options,
      ...ExpressionSchema.shape.emotion.options,
    ]) {
      expect(prompt).toContain(label);
    }
  }
});

it('persists every supported emotion with bounded gradual PAD rather than dropping unfamiliar labels', async () => {
  const values = new Map<string, string>();
  const repository = {
    async read(key: string) {
      return values.get(key) ?? null;
    },
    async compareAndSave(key: string, previous: string | null, next: string) {
      if ((values.get(key) ?? null) !== previous) {
        return false;
      }

      values.set(key, next);

      return true;
    },
  };
  const state = createPersistentPersonaState(
    repository,
    'contract-test',
    () => 1,
  );
  let previous = await state.snapshot('synthetic');

  for (const emotion of ExpressionSchema.shape.emotion.options) {
    const expression = { intent: 'reagir' as const, emotion, intensity: 1 };
    await state.observe('synthetic', emotion, expression);
    const next = await state.snapshot('synthetic');

    for (const axis of ['pleasure', 'arousal', 'dominance'] as const) {
      expect(Number.isFinite(next[axis])).toBe(true);
      expect(Math.abs(next[axis] - previous[axis])).toBeLessThanOrEqual(0.081);
    }

    expect(next.interactions).toBe(previous.interactions + 1);
    expect(expressionDeliveryReview(expression)).toMatchObject({
      valid: true,
      executable: false,
    });
    previous = next;
  }
});
