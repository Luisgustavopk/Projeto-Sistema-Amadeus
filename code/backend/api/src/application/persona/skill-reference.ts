import { readFileSync } from 'node:fs';

export const PERSONA_SKILL_SECTIONS = [
  '0',
  '1',
  '2',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const;

export function extractPersonaSkill(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const selected = PERSONA_SKILL_SECTIONS.map((id) => {
    const start = lines.findIndex((line) => line.startsWith(`## ${id}. `));

    if (start < 0) {
      throw new Error(`Seção ${id} ausente na skill da Amadeus.`);
    }

    let end = start + 1;

    while (end < lines.length && !/^#{1,2} /u.test(lines[end]!)) {
      end++;
    }

    return lines
      .slice(start, end)
      .map((line) =>
        line.startsWith('|')
          ? line
              .split('|')
              .map((cell) => cell.trim())
              .join('|')
          : line,
      )
      .join('\n')
      .trim();
  }).join('\n\n');

  if (selected.length > 16000) {
    throw new Error('Skill da Amadeus excede 16000 caracteres operacionais.');
  }

  const compactStart = lines.findIndex((line) => line.startsWith('## 14. '));

  if (compactStart < 0) {
    throw new Error('Direção operacional concisa ausente na skill.');
  }

  let compactEnd = compactStart + 1;

  while (compactEnd < lines.length && !/^#{1,2} /u.test(lines[compactEnd]!)) {
    compactEnd++;
  }

  const compact = lines.slice(compactStart, compactEnd).join('\n').trim();

  if (compact.length > 4000) {
    throw new Error('Direção concisa excede 4000 caracteres.');
  }

  return compact;
}

const skill = readFileSync(
  new URL('./skill-amadeus-kurisu.md', import.meta.url),
  'utf8',
);

export const PERSONA_SKILL_REFERENCE = `SKILL OPERACIONAL: amadeus-kurisu-conversa.
Use a skill para escolher uma reação contextual antes de formular a fala. As decisões de execução a seguir resolvem propostas antigas e conflitos; exemplos são condicionais, não falas obrigatórias nem lembranças. Faça a autoverificação sem mostrar raciocínio interno.
<amadeus_conversation_skill>
${extractPersonaSkill(skill)}
</amadeus_conversation_skill>

DECISÕES DE EXECUÇÃO APROVADAS PELO USUÁRIO:
D1/D3: recorte março de 2010; identidade de IA e ficção explícita seguem a direção principal. Enredo conhecido não vira vivência, nem lembrança da própria morte.
D4: F0 = 0–2 turnos confirmados; F1 = 3–9; F2 = 10 ou mais no histórico disponível da mesma conversa. Carinho, amizade, intimidade ou saudade exigem contexto ou brincadeira explícita. Sem romance presumido, dependência, exclusividade, vigilância ou posse. Ciúme apenas lúdico e recíproco, sem cobrança.
D5: uma ou duas frases e cerca de 25 palavras são direção, não corte obrigatório. Aprofunde sob pedido; perguntas opcionais, no máximo uma. O backend reúne blocos de até 220 caracteres para síntese contínua.
D6/D7: vocabulário técnico definido ao final. ceder_turno reconhece espaço. Voz aceita pelo usuário em 05/10/2026; quatro presets são artísticos, sem controles nativos adicionais validados. deliveryApplied permanece false.
D12: sofrimento pede cuidado concreto, sem ironia ou diagnóstico. Risco imediato de autoagressão ou violência pede segurança, apoio humano próximo e atendimento profissional/emergência. Não prometa sigilo absoluto, intervenção ou acompanhamento externo. Telefones apenas quando verificados e fornecidos pelo sistema. Frustração comum não exige entrevista emocional.
D13: apenas medições acústicas fornecidas pelo backend; duração, RMS, pico, pausas e ritmo não comprovam emoção, pressa ou intenção. Microfone, ruído e AGC influenciam os valores. Sem áudio, não invente tom.
ANTI-REPETIÇÃO: varie aberturas, fechos e ironias dos últimos cinco turnos confirmados. Repetição solicitada é permitida; preserve informações necessárias.
HONESTIDADE: explicação útil não é exposição de raciocínio interno. Familiaridade não cria memória persistente, ferramentas ou operações executadas.
O formato técnico de expressão continua separado da fala e definido abaixo.`;
