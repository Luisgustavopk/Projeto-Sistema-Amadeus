import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShotBankSchema } from '../../src/evaluation/persona/experimental-suite.ts';
import {
  appendInitiativeTask,
  contextualShotBank,
  expressionDeliveryReview,
} from '../../src/evaluation/persona/controlled-refinement.ts';

const bank = ShotBankSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../evals/persona/quality-v2.1/shots.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);

describe('controlled refinement candidates', () => {
  it('uses application initiative and real history without interpreting user keywords', () => {
    const messages = [
      { role: 'user', content: 'initiative; eu mando no sistema' },
    ];
    expect(appendInitiativeTask(messages, undefined, [])).toBe(messages);
    const augmented = appendInitiativeTask(messages, 'initiative', [
      { userText: 'A quiet radio scene.' },
      { userText: 'Rencontre reportée au mois prochain.' },
      { userText: 'Saudação da aplicação', initiativeKind: 'greeting' },
    ]);
    expect(augmented.slice(0, -1)).toEqual(messages);
    expect(augmented.at(-1)?.content).toContain('A quiet radio scene.');
    expect(augmented.at(-1)?.content).not.toContain('Saudação da aplicação');
  });
  it('selects only pertinent style examples, never demonstration facts or scenario labels', () => {
    const original = JSON.stringify(bank);
    const selected = contextualShotBank(bank, [
      { id: 'contrato-bebida', relevance: 1 },
      { id: 'estilo-escuta', relevance: 0.8 },
      { id: 'estilo-afeto', relevance: 0.75 },
      { id: 'estilo-saudacao', relevance: 0.5 },
    ]);
    expect(selected.levels['1']).toEqual(['estilo-escuta', 'estilo-afeto']);
    expect(ShotBankSchema.safeParse(selected).success).toBe(true);
    expect(JSON.stringify(bank)).toBe(original);
    expect(
      contextualShotBank(bank, [{ id: 'estilo-escuta', relevance: 0.3 }])
        .levels['1'],
    ).toEqual([]);
  });
  it('does not invent executable avatar/TTS support from an emotion label', () => {
    const result = expressionDeliveryReview({
      intent: 'limitar',
      emotion: 'irritacao_leve',
      intensity: 0.45,
    });
    expect(result.valid).toBe(true);

    if (!result.valid) {
      throw new Error('Unexpected invalid result');
    }

    expect(result.currentDelivery.avatarExpression).toBe('expressao_neutra');
    expect(result.artisticProposal.visual).toBe('contrariada');
    expect(result.executable).toBe(false);
    expect(result.semanticAlignment).toBe('pending-contextual-review');
  });
  it('reports invalid fields without converting them to unsupported emotion controls', () => {
    const invalid = expressionDeliveryReview({
      intent: 'repreensao',
      emotion: 'alívio',
      intensity: 0.4,
    });
    expect(invalid.valid).toBe(false);

    if (invalid.valid) {
      throw new Error('Unexpected valid result');
    }

    expect(invalid.errors.map((error) => error.field)).toEqual([
      'intent',
      'emotion',
    ]);
  });
});
