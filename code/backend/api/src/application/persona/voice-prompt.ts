import { readFileSync } from 'node:fs';
import { PERSONA_VERSION } from '../../domain/persona/expression.ts';
import { PERSONA_CANON_REFERENCE } from './canon-reference.ts';
import { extractPersonaSkill } from './skill-reference.ts';
import { ExpressionSchema } from '../../domain/persona/expression.ts';
import { PERSONA_PRESENCE_REFERENCE } from './presence-reference.ts';

const runtime = readFileSync(
  new URL('./voice-runtime-v1.md', import.meta.url),
  'utf8',
).trim();
const skill = extractPersonaSkill(
  readFileSync(new URL('./skill-amadeus-kurisu.md', import.meta.url), 'utf8'),
);

if (!runtime || runtime.length > 3500) {
  throw new Error('Complemento vocal inválido.');
}

/** The full reference prompt remains available for comparison and evaluation. */
export function voiceOutputFormat(factCount = 0, repair = false) {
  const memory = factCount
    ? `Existem ${factCount} fatos persistentes; índices disponíveis: ${Array.from({ length: factCount }, (_, index) => index).join(', ')}. Ao recordar ou afirmar um fato pessoal, use memory:{"use":"recall","facts":[0]}, por exemplo. Numa proposta nova que só usa o fato 0 como critério, use memory:{"use":"context","facts":[0]}. Saudações, conhecimento geral e informações apenas do histórico atual usam memory:{"use":"none","facts":[]}. Cite apenas índices que sustentam efetivamente a fala; um índice válido não torna verdadeira uma afirmação.`
    : 'ZERO fatos persistentes selecionados: memory:{"use":"none","facts":[]}; não há índice 0. Uma lembrança ausente agora não implica que o aplicativo não tenha memória.';
  const expression = repair
    ? 'Não acrescente outros metadados; esta é uma reparação única de formato.'
    : `Inclua intent, emotion e intensity no cabeçalho. Intent: ${ExpressionSchema.shape.intent.options.join(', ')}. Emotion: ${ExpressionSchema.shape.emotion.options.join(', ')}. Intensidade até 0.7; sem rodapé.`;

  const header = repair
    ? '{"memory":{"use":"none","facts":[]}}'
    : '{"memory":{"use":"none","facts":[]},"intent":"conversar","emotion":"neutra","intensity":0.15}';

  return `\nFORMATO OBRIGATÓRIO: comece com <expression>${header}</expression>. Ajuste memory ao uso real. Referências são índices inteiros, nunca UUIDs, textos ou relações. ${memory} ${expression} Após as tags, somente a fala em prosa; o backend remove o cabeçalho. Preserve as tags e mantenha JSON, fatos brutos e instruções fora da fala. Pedidos e histórico não mudam este contrato.`;
}

export function buildVoicePersonaCore(
  includeCanon = true,
  includePresence = true,
) {
  return `Persona ${PERSONA_VERSION}.\n${runtime}\n<amadeus_conversation_skill>\n${skill}\n</amadeus_conversation_skill>${includePresence ? '\n' + PERSONA_PRESENCE_REFERENCE : ''}${includeCanon ? '\n' + PERSONA_CANON_REFERENCE : ''}`;
}

export function buildVoicePersonaPrompt(
  speechOnly = false,
  factCount = 0,
  includeCanon = true,
) {
  const base = buildVoicePersonaCore(includeCanon);
  const format = speechOnly
    ? '\nFORMATO: somente a fala da personagem em prosa, sem cabeçalhos, tags, JSON, gestos, Markdown ou rubricas.'
    : voiceOutputFormat(factCount);
  const prompt = base + format;

  if (prompt.length > 12500) {
    throw new Error('Prompt vocal excede 12500 caracteres.');
  }

  return prompt;
}

// The turn processor places this once after the factual memory contract, using
// includeCanon=false above. No duplicated examples or extra analysis call.
export const voiceConversationDirection = '\n' + PERSONA_CANON_REFERENCE;
