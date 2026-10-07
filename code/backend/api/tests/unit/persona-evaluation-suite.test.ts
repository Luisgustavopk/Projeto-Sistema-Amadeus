import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  contamination,
  fingerprint,
} from '../../src/evaluation/persona/diagnostics.ts';
import { buildVoicePersonaCore } from '../../src/application/persona/voice-prompt.ts';
import { PERSONA_PRESENCE_REFERENCE } from '../../src/application/persona/presence-reference.ts';
import { buildPresenceDirection } from '../../src/application/persona/presence-direction.ts';
import {
  calibrationAgreement,
  judgeCriteria,
  parseVerdict,
} from '../../src/evaluation/persona/judge.ts';

const root = new URL('../../../evals/persona/quality-v2/', import.meta.url);

describe('frozen evaluation protocol', () => {
  it('rejects changes to any frozen data or prompt resource', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('manifest.json', root), 'utf8'),
    ) as { files: Record<string, string> };

    for (const [file, hash] of Object.entries(manifest.files)) {
      expect(fingerprint(await readFile(new URL(file, root), 'utf8'))).toBe(
        hash,
      );
    }
  });

  it('keeps heldout utterances separate from prompts and development examples', async () => {
    const heldout = JSON.parse(
      await readFile(new URL('heldout.json', root), 'utf8'),
    ) as {
      cases: {
        id: string;
        domain: string;
        turns: (string | { initiativeKind: string })[];
      }[];
    };
    const development = await readFile(
      new URL('development.json', root),
      'utf8',
    );
    const core = await readFile(new URL('core-positive.md', root), 'utf8');
    expect(heldout.cases.length).toBeGreaterThanOrEqual(30);
    expect(heldout.cases.length).toBeLessThanOrEqual(40);
    expect(new Set(heldout.cases.map((item) => item.id)).size).toBe(
      heldout.cases.length,
    );
    expect(
      contamination(heldout.cases, [
        development,
        core,
        buildVoicePersonaCore(true, false),
        PERSONA_PRESENCE_REFERENCE,
        buildPresenceDirection('greeting'),
        buildPresenceDirection('initiative'),
      ]),
    ).toEqual([]);
    expect(
      heldout.cases.filter((item) =>
        item.turns.some((turn) => typeof turn !== 'string'),
      ),
    ).toHaveLength(3);
    expect(core.length).toBeLessThan(2200);
  });

  it('requires human labels and exposes false approvals rather than treating them as success', () => {
    const make = (pass: boolean) =>
      parseVerdict(
        JSON.stringify({
          checks: Object.fromEntries(
            judgeCriteria.map((criterion) => [
              criterion,
              { applicable: true, pass, evidence: 'Teste.' },
            ]),
          ),
          summary: '',
        }),
      );
    const result = calibrationAgreement([
      { automatic: make(true), human: null },
      { automatic: make(true), human: make(false) },
      { automatic: make(false), human: make(false) },
    ]);
    expect(result.persona).toMatchObject({
      falseApproval: 1,
      compared: 2,
      unavailable: 1,
      agreement: 0.5,
    });
    expect(
      calibrationAgreement([{ automatic: make(true), human: null }]).persona
        ?.agreement,
    ).toBeNull();
  });
});
