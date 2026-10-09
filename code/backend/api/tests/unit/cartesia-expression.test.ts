import { expect, it } from 'vitest';
import { cartesiaExpression } from '../../src/adapters/providers/cartesia-expression.ts';
import { ExpressionSchema } from '../../src/domain/persona/expression.ts';
import { validateProviderInput } from '../../src/application/providers/input.ts';

it('graduа irritação pela intensidade sem aumentar volume ou forçar bordões', () => {
  const input = { intent: 'limitar', emotion: 'raiva', intensity: 0.3 };
  expect(cartesiaExpression(input)?.generation_config).toEqual({
    emotion: 'frustrated',
  });
  expect(
    cartesiaExpression({ ...input, intensity: 0.6 })?.generation_config,
  ).toEqual({ emotion: 'angry' });
  expect(
    cartesiaExpression({ ...input, intensity: 0.9 })?.generation_config,
  ).toEqual({ emotion: 'mad' });
  expect(
    cartesiaExpression({ ...input, intensity: 0.05 })?.generation_config,
  ).toEqual({ emotion: 'neutral' });
  expect(cartesiaExpression({ ...input, intensity: 2 })).toBeNull();
});

it('cobre o contrato artístico e aceita controles somente para síntese', () => {
  for (const emotion of ExpressionSchema.shape.emotion.options) {
    expect(
      cartesiaExpression({ intent: 'reagir', emotion, intensity: 0.5 })
        ?.generation_config.emotion,
    ).toBeTruthy();
  }

  const input = {
    content: 'Uma fala.',
    dataClass: 'synthetic' as const,
    maxTokens: 1,
    speechExpression: ExpressionSchema.parse({
      intent: 'limitar',
      emotion: 'irritacao',
      intensity: 0.6,
    }),
  };
  expect(() => validateProviderInput('tts', input)).not.toThrow();
  expect(() => validateProviderInput('llm', input)).toThrow();
});
