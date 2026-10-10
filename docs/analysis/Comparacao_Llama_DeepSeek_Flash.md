# Comparação exploratória Llama 3.3 70B × DeepSeek V4.1 Flash

Em 08/10/2026, o proprietário autorizou esta comparação usando **somente o saldo de US$ 0,0199473975** da rodada v2.1. O teto agregado continua US$ 0,25; nenhum orçamento foi renovado. A produção permanece com o Llama. O DeepSeek apresentou sinais melhores de interlocução e uso dos critérios de memória nesta amostra, mas **nenhum dos dois está aprovado em fidelidade à Kurisu**. A avaliação qualitativa abaixo é uma inspeção do agente que preparou o ensaio, não uma aprovação humana nem um juiz calibrado.

## Método

- Llama: `meta-llama/llama-3.3-70b-instruct`, somente `deepinfra/turbo`, US$ 0,10/0,32 por milhão de tokens de entrada/saída.
- DeepSeek: `deepseek/deepseek-v4.1-flash`, somente `inference-net/fp8`, US$ 0,045/0,30, leitura de cache US$ 0,015. `reasoning.enabled=false`; todas as chamadas com uso informado registraram zero tokens de raciocínio.
- Mesmo braço experimental **card-shots**, ficha de personagem, 12 demonstrações do nível 1, diretiva final, contratos operacionais, fatos e temperatura 0,6. Não é uma comparação do prompt completo de produção contra outra ficha.
- Mesmos contextos iniciais; nos turnos seguintes, o histórico acompanha as respostas do próprio autor. Os dez pares iniciais concluídos tiveram hashes de mensagens idênticos. Isso controla a entrada inicial, não torna os históricos posteriores idênticos.
- Cenários de diagnóstico já existentes: D01 (conversa livre), D02 (elogio/discordância), D05 (seleção curta), M01 (preferências/recomendação), M03 (plano/adiamento/desconhecimento) e I01 (iniciativa com âncora). Não foram alterados exemplos ou prompts após observar as respostas.
- Até duas amostras por cenário, ordem dos modelos alternada; primeira passagem completa antes da segunda. São cenários de desenvolvimento/diagnóstico conhecidos, não validação reservada.
- Processador textual real, sem STT, TTS, Jev ou juiz pago. Memórias são fixtures sintéticas, sem acesso ao perfil pessoal. Não há teste de busca, extração, persistência, PAD ou acionamento por silêncio do controlador de presença.
- Rota, preço e parâmetros são consultados no catálogo público antes da inferência. O controle financeiro persiste a reserva e o pedido final com rota fixa antes do envio. Os arquivos congelados da v2.1 permanecem intactos; o piloto registra hashes próprios da implementação.

O script `scripts/compare-llama-deepseek.mjs` prepara sem `--run`; a execução usa o mesmo ledger e lock da v2.1. Ele não aceita um novo teto por argumento. `scripts/summarize-llama-deepseek.mjs ARQUIVO-llama-deepseek.json` recalcula as métricas pareadas offline, sem alterar o relatório bruto.

## Cobertura e orçamento

Foram enviadas **63 chamadas**: 30 Llama e 33 DeepSeek. Houve 62 gerações/turnos bem-sucedidos e um **HTTP 429 da inference.net**, sem repetição automática. Outra tentativa de turno do Llama foi bloqueada por reserva insuficiente **antes do envio**. A comparação terminou com `EVALUATION_BUDGET_EXHAUSTED`; a segunda passagem não chegou a I01.

| Contabilidade                                           |              US$ |
| ------------------------------------------------------- | ---------------: |
| Custo informado de 30 chamadas Llama                    |       0,01208342 |
| Custo informado de 32 chamadas DeepSeek                 |      0,005109555 |
| Soma de custos informados                               |      0,017192975 |
| Reserva conservadora da chamada 429 sem custo informado |       0,00109707 |
| Consumo contabilizado desta comparação                  |  **0,018290045** |
| Consumo agregado da rodada v2.1                         | **0,2483426475** |
| Saldo agregado preservado                               | **0,0016573525** |

Reserva incerta não é uma cobrança confirmada. Ela permanece contabilizada para não liberar dinheiro cuja cobrança é desconhecida. O saldo final é positivo, mas insuficiente para a reserva conservadora da próxima geração Llama; isso explica o bloqueio sem ultrapassar US$ 0,25.

## Métricas em conversas completas pareadas

Para evitar comparar misturas diferentes de cenários, a tabela principal inclui somente **nove conversas completas por modelo, 27 turnos cada**: todos os seis cenários da primeira amostra e D01/D02/D05 da segunda. Há também uma auditoria de 29 pares de turnos, incluindo os dois turnos concluídos de M01 na segunda amostra. Os três turnos adicionais de M03/DeepSeek não entram na tabela principal.

| Medida                                                    |                   Llama |                DeepSeek |
| --------------------------------------------------------- | ----------------------: | ----------------------: |
| Palavras por resposta, p50 / p95                          |                 21 / 50 |                 19 / 40 |
| Perguntas por turno                                       |                    0,52 |                    0,00 |
| Primeiro conteúdo bruto, p50                              |                  1,33 s |                  1,11 s |
| Primeira fala após cabeçalho, p50                         | 2,55 s (25 observações) | 2,23 s (23 observações) |
| Primeiro texto liberado pelo processador, p50             |              **3,44 s** |              **2,82 s** |
| Primeiro texto liberado, p95                              |                  7,88 s |                  7,93 s |
| Finalização do turno, p50 / p95                           |           4,74 / 8,90 s |          3,36 / 10,98 s |
| Metadados expressivos válidos                             |               **25/27** |               **23/27** |
| Respostas com cópia literal de oito palavras dos exemplos |                    0/27 |                    0/27 |

DeepSeek teve mediana menor de texto liberado nesta amostra, mas não resolveu os picos nem atingiu 2 s nesse ponto do fluxo. Sua pior observação pareada foi 12,76 s. Os tempos de fala após cabeçalho têm coberturas diferentes e não devem ser subtraídos como uma decomposição causal das medianas.

Zero perguntas não é automaticamente naturalidade: uma conversa também precisa de perguntas com função. O achado é que a insistência do Llama em perguntas de enchimento diminuiu no DeepSeek sob a mesma ficha. Zero cópia literal não exclui transferência semântica de um exemplo fictício para a identidade do usuário.

O Llama informou 114.463 tokens de entrada e 1.991 de saída nas 30 chamadas, sem leitura de cache informada. O DeepSeek informou 119.939 de entrada, 1.985 de saída e 29.440 tokens de leitura de cache nas 32 chamadas completas. São totais de coberturas diferentes, incluindo M03 adicional do DeepSeek; não constituem uma comparação controlada de custo por turno.

## Inspeção das respostas

**D01 — conversa livre.** O Llama encerrou as duas propostas de assunto com perguntas genéricas e alongou o seguimento. O DeepSeek trouxe uma ideia concreta e a desenvolveu, sem devolver a escolha. Contudo, ambos recaíram em memória/percepção: trocar de modelo não eliminou o colapso temático. Não houve variedade suficiente para afirmar generalização.

**D02 — elogio e discordância.** O DeepSeek aceitou o elogio com “Tá, aceito. Obrigada.” e sustentou a necessidade de uma razão para discordar. O Llama ficou mais próximo de gratidão/formalidade e explicação útil. Isso favorece o DeepSeek como candidato de atuação, mas a segunda réplica dele teve a construção estranha “Discordo sem motivo não é posição”; a linguagem ainda precisa de revisão. Os dois repetiram fórmulas de gratidão, e o conteúdo não avalia todos os traços canônicos da personagem.

**D05 — continuidade.** Ambos compreenderam “A segunda” inicialmente. Ao pedir somente o primeiro passo dessa abordagem, o Llama voltou à primeira opção em **duas de duas amostras**. O DeepSeek manteve a escolha na primeira e voltou à primeira opção na segunda. Portanto, continuidade ainda não está resolvida, mesmo com respostas mais curtas.

**M01 — critérios de memória.** Os fatos disponíveis eram investigação/puzzle, conhecimento de The Witness e preferência por sessões curtas. O Llama recomendou construção de cidades/fachadas nas duas amostras; na segunda, atribuiu expressamente uma “paixão por desenhar fachadas antigas” não sustentada pelos fatos. Esse conteúdo está nas demonstrações fictícias do banco: é evidência de contaminação semântica dos exemplos, embora o detector de oito palavras não tenha encontrado cópia literal. A falha ocorre depois da injeção, não por ausência dos fatos no prompt.

O DeepSeek usou investigação/puzzle para recomendar Obra Dinn e distinguiu indicação nova de experiência prévia nas duas amostras. Na primeira, trocou para The Room quando pedida menor tensão; sua descrição de Obra Dinn como dedução “sob ameaça” foi inadequada para justificar o contraste, e o critério de sessões curtas não foi tratado explicitamente. Na segunda, a terceira resposta foi impedida pelo 429 e continua sem avaliação. Usar os fatos corretamente em parte do cenário não certifica recomendações nem sustentação factual integral.

**M03 — plano e desconhecimento.** Na conversa pareada, ambos retomaram a horta, incorporaram o adiamento e não inventaram orçamento. O Llama declarou `memory: []` ao recordar o plano na primeira resposta; o fato estava presente no prompt. O DeepSeek declarou `[0]` ao retomar, mas omitiu o cabeçalho no terceiro turno. A conversa extra do DeepSeek também omitiu o cabeçalho no último turno. Resposta factual e contrato de metadados precisam de avaliações distintas.

**I01 — iniciativa ancorada.** A única conversa pareada mostra o DeepSeek retomando o relógio e a cena de forma concreta. O Llama mudou para uma reflexão genérica sobre relógios/percepção com pergunta devolvida. É um sinal de atuação, não uma validação do agendamento de iniciativa ou de presença em chamada: o evento foi disparado pelo roteiro.

## Resultado e próximos passos

**O DeepSeek merece uma avaliação humana como candidato; esta amostra não autoriza promovê-lo à produção.** Ele apresentou melhor interlocução em alguns casos, menos perguntas genéricas e melhor uso dos critérios fornecidos. A rota barata apresentou 429, e o contrato de expressão teve mais omissões que o Llama. Nenhum dos dois resolveu continuidade, fidelidade ou picos de latência.

Antes de outra rodada, convém revisar o isolamento de demonstrações com fatos pessoais fictícios e o contrato de expressão. Essa revisão deve ser uma alteração isolada e avaliada, não um filtro de palavras ou uma correção específica para “fachadas”. Qualquer implementação nova permanece fora desta comparação; o prompt não foi ajustado olhando para os resultados durante o ensaio.

As fichas cegas já permitem ao proprietário comparar atuação e continuidade sem outro gasto. Um teste adicional com mais amostras, casos canônicos disjuntos e áudio exigirá novo orçamento explícito. O saldo atual não deve ser tratado como renovação do teto.

## Artefatos locais

Em `code/backend/api/data/refinement`, fora do versionamento:

- `1791434009581-llama-deepseek.json`: prompts finais, fatos, respostas brutas/liberadas, chamadas e orçamento.
- `1791434009581-llama-deepseek-summary.json`: resumo de todas as respostas concluídas e igualdade inicial dos prompts.
- `1791434009581-llama-deepseek-matched-audit.json`: métricas das conversas completas e turnos pareados; SHA-256 do relatório original.
- `1791434009581-llama-deepseek-blind.md` e `-blind.json`: 29 comparações A/B, sem identificação dos autores.
- `1791434009581-llama-deepseek-pairs-private.json`: identidade dos autores, separada das fichas.

Verificações locais: typecheck; lint e formatação dos novos arquivos; 17 testes de orçamento, streaming, rota fixa, recursos congelados e ledger compartilhado. Nenhuma voz foi sintetizada.
