import { describe, expect, it } from 'vitest';
import {
  corpusStyleProfile,
  parseDialogueCsv,
} from '../../src/evaluation/persona/corpus-profile.ts';

describe('corpus profile without raw export', () => {
  it('parses BOM, quoted commas, newlines and escaped quotes', () => {
    expect(
      parseDialogueCsv(
        '\uFEFFname,response\r\nKurisu,"Hello,\n""world""!"\r\n',
      ),
    ).toEqual([{ speaker: 'Kurisu', text: 'Hello,\n"world"!' }]);
    expect(() => parseDialogueCsv('name,response\nKurisu,"open')).toThrow();
    expect(() =>
      parseDialogueCsv('name,response\nKurisu,hello,extra'),
    ).toThrow();
  });
  it('distinguishes question prevalence from question count and exports aggregates', () => {
    const texts = ['Yes.', 'Why? Really?', 'Hmm...'];
    const profile = corpusStyleProfile(texts);
    expect(profile.hasQuestionRate).toBeCloseTo(1 / 3);
    expect(profile.questionsPerUnit.p90).toBe(2);
    expect(profile.ellipsisRate).toBeCloseTo(1 / 3);
    expect(JSON.stringify(profile)).not.toContain('Really');
    expect(corpusStyleProfile([]).hasQuestionRate).toBeNull();
  });
});
