# Atuação encadeada — experimento isolado de US$ 0,27

Llama 3.3 70B, OpenRouter, DeepInfra Turbo, temperatura 0,6, até 512 tokens. Não altera a produção. O teto é novo e agregado: autores, Jev, falhas sem custo conhecido e reservas. Não reutiliza o saldo de outras rodadas.

Braço before: banco original v2.1. Braço after: mesmo banco e fontes, oito sequências editoriais substituídas. Ambos usam BGE-M3 local, a mesma consulta (fala atual e dois turnos anteriores), limiar e máximo de três exemplos. Comprimento e seleção dos exemplos podem mudar: fazem parte do tratamento. Núcleo, direções, presença, contrato de saída, processador, rota e amostragem ficam iguais. O histórico gerado pertence a cada braço; divergências posteriores são efeito acumulado, não comparação com histórico artificial comum.

Seis conversas de desenvolvimento × quatro turnos × dois braços × cinco amostras; quatro reservadas × quatro turnos × dois braços × três amostras: 336 turnos planejados. Ordem dos braços alternada. Manifesto e implementação congelados por hash antes das chamadas. Não ajustar o banco após ler os reservados. Margem de US$ 0,04 para juiz/falhas; o autor interrompe antes de iniciar novo par se a estimativa não couber. A reserva conservadora por pedido continua obrigatória.

## Curadoria e rastreabilidade

As falas são adaptações originais em pt-BR. Os IDs, links, revisão e linhas de origem no JSON vêm do banco anterior. Justificam funções delimitadas, não cada emoção ou frase nova:

- apelido: rejeição de tratamento; insistência e desculpa são extensões editoriais;
- limite: firmeza e limites, sem transferir a relação com Okabe;
- elogio: a fonte sustenta gratidão; constrangimento é candidato editorial, não conclusão da cena;
- evidência: raciocínio e atualização; o problema de arquivo é ficção do exemplo;
- reparo: correção própria; legenda e colunas são situação original;
- simplicidade: concisão; surpresa/alegria são extensão editorial, não comprovadas por esse trecho;
- escuta: espaço para assunto pessoal; foto e saudade são situação original;
- discordância: posição e raciocínio; humor sobre inspiração e recuo são extensão editorial.

Nenhuma vivência de laboratório, conhecimento futuro, romance ou vínculo com Okabe é importado como memória. As expressões do cabeçalho são rótulos demonstrativos; não contam como atuação aprovada. Avaliar o texto e a transição: reação com alvo, intensidade proporcional, firmeza, reserva, calor e recomposição. Interjeição é opcional; ausência não reprova e presença não aprova.

## Avaliação e limites

Os critérios por turno ficam apenas no relatório, nunca no prompt. Examinar provocações, reparos, elogios, surpresa, alegria, dúvida, tristeza e controles de sofrimento/pergunta simples. Reportar resultados por conversa e amostra, além de comprimento, perguntas, repetição, seleção, formato, custos e primeiro texto utilizável. A amostra é pequena; não transforma sinais de melhora em aprovação humana.

Depois, avaliar Jev com critérios independentes de adequação e expressividade e comparação relativa. Empate não implica aprovação; ambas inadequadas não equivale a escolher a menos ruim. Controles novos têm gabarito editorial, separado das preferências pessoais anteriores. Pares novos reais precisam de revisão pessoal antes de validar roteamento. Sem seleção em produção, treinamento automático ou áudio pago.
