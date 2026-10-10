import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PERSONA_VERSION } from '../../domain/persona/expression.ts';
import { buildVoicePersonaCore } from './voice-prompt.ts';
import { PERSONA_EXPRESSIVE_REFERENCE } from './expressive-reference.ts';
import { extractPersonaSkill } from './skill-reference.ts';

export type ActingMode = 'curated' | 'refined';
const resource = (directory: string, file: string) =>
  readFileSync(
    new URL(
      import.meta.url.endsWith('.ts')
        ? `../../../../evals/persona/${directory}/${file}`
        : `./${file}`,
      import.meta.url,
    ),
    'utf8',
  ).trim();
const card = resource('quality-v2.1', 'core-card.md');
const presence = resource('quality-v3', 'presence-positive.md');
const finalDirection = resource('quality-v2.1', 'turn-direction.md');
const skill = extractPersonaSkill(
  readFileSync(new URL('./skill-amadeus-kurisu.md', import.meta.url), 'utf8'),
);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Runtime and new evaluations use the same frozen acting resources. */
export function buildActingCore(mode: ActingMode = 'curated') {
  if (mode === 'curated') {
    return buildVoicePersonaCore(true, false);
  }

  return `Persona ${PERSONA_VERSION}.\n${card}\n<amadeus_conversation_skill>\n${skill}\n</amadeus_conversation_skill>\n<persona_conversation_presence>\n${presence}\n</persona_conversation_presence>\n${PERSONA_EXPRESSIVE_REFERENCE}`;
}

export function actingTurnDirection(mode: ActingMode = 'curated') {
  return mode === 'refined' ? '\n' + finalDirection : '';
}

export function actingDiagnostics(mode: ActingMode = 'curated') {
  const core = buildActingCore(mode);

  return {
    mode,
    version: PERSONA_VERSION,
    coreHash: hash(core),
    coreCharacters: core.length,
    finalDirectionHash: hash(actingTurnDirection(mode)),
    sources:
      mode === 'refined'
        ? [
            { file: 'quality-v2.1/core-card.md', hash: hash(card) },
            { file: 'quality-v3/presence-positive.md', hash: hash(presence) },
          ]
        : [],
  };
}
