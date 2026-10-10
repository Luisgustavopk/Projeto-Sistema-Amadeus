# Calibração Jev — preferência pessoal, persona e expressividade

**Resultado: não aprovar seleção automática entre Llama e DeepSeek nesta etapa.** O juiz melhorou ao receber definições explícitas de atuação, mas ainda não supera a referência simples da classe majoritária deste conjunto, força escolhas onde o proprietário marcou empate e aprova expressividade insuficiente. As notas de persona podem servir como diagnóstico de desenvolvimento; não substituem revisão pessoal ou validação nova.

## Método

Referência: 30 pares reais Llama × DeepSeek revisados pelo proprietário com assistência do Claude, 23 conversas conhecidas de desenvolvimento. Há 60 respostas-alvo. Os dois autores seguem históricos próprios, preservados nas fichas; isso não isola o efeito do autor sob um histórico idêntico em todos os turnos. Nenhuma nova resposta dos autores foi gerada nesta calibração.

O extra acrescentou 26 pares sintéticos com gabarito de intenção do agente. Seus campos de avaliação pessoal estavam vazios. O extra mede contraste projetado, não concordância humana. Os itens 4, 6, 9 e 21 foram mantidos como diagnóstico sem acerto binário obrigatório pelas ressalvas registradas na [referência](Calibracao_Jev_Referencia_Pessoal_2026-10-08.md). Restam 22 controles comparáveis à intenção declarada.

As notas, o gabarito, sugestões expressivas e autores foram ocultados do Jev. O item 30 foi excluído da concordância de preferência conforme confirmação direta do proprietário. Os itens 5 e 21 tinham preferência incerta: também foram excluídos, sem converter as outras notas em uma preferência inferida. Restam 27 preferências avaliáveis: 20 escolhas explícitas e sete empates.

O protocolo usa decisões estruturadas, sem justificativa livre. A documentação descreve perguntas tipadas e probabilidades; definições concretas das opções fazem parte do contrato. As probabilidades reportadas não foram tratadas como garantia de calibração. [Documentação Jev](https://openrouter.ai/docs/guides/community/jev), [guia de classificação](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification).

## Três revisões preservadas

| Revisão | Mudança                                                                                             | Chamadas | Preferência pessoal | Extra sintético | p50 / p95 por pedido |   Custo efetivo |
| ------- | --------------------------------------------------------------------------------------------------- | -------: | ------------------: | --------------: | -------------------- | --------------: |
| v1      | Rubrica completa na preferência, critérios individuais resumidos; oito inversões A/B                |       64 |       16/27 — 59,3% |           18/22 | 431 / 512 ms         | US$ 0,006299958 |
| v2      | Definições independentes de aceitabilidade, persona, emoção e expressividade; sem repetir inversões |       56 |       16/27 — 59,3% |           18/22 | 450 / 672 ms         | US$ 0,008019858 |
| v3      | Definições mais concretas de A/B, empate, nenhuma e incerto; somente preferência; oito inversões    |       64 |       18/27 — 66,7% |           19/22 | 454 / 575 ms         | US$ 0,003945270 |

Na v1, o avaliador que implementamos deixou a rubrica detalhada somente na pergunta de preferência. As perguntas individuais eram vagas demais para sustentar uma conclusão sobre a capacidade do Jev de avaliar personagem. A v2 corrigiu as definições e a referência explícita à resposta-alvo. A v3 isolou a escolha relativa: não produziu novas notas individuais. A omissão das inversões na v2 reduziu a reserva necessária; as métricas humanas e sintéticas acima usam os mesmos 30 e 26 pares nas três revisões.

Uma amostra por orientação e revisão. As mudanças foram elaboradas olhando dados de desenvolvimento; os ganhos são calibração no conjunto conhecido, não generalização provada. As oito inversões mantiveram a escolha em 8/8 na v1 e 7/8 na v3. A divergência da v3 ocorreu no item 25, que o proprietário marcou como empate: a escolha forçada mudou de lado. O resultado indica instabilidade nesse caso, sem demonstrar sozinho um viés geral pela letra.

## Escolha relativa ainda não justifica um roteador

Na v3, foram 17/20 acertos nas escolhas explícitas e 1/7 nos empates. Sempre escolher a opção do DeepSeek alcançaria 19/27 neste conjunto, ou 19/20 considerando somente escolhas explícitas. Essa referência serve para verificar se a complexidade extra agrega valor; não aprova o DeepSeek como persona completa nem prevê o resultado em outros cenários.

As divergências avaliáveis finais foram nos itens 3, 6, 7, 9, 12, 17, 19, 23 e 25. O item 17 conserva a preferência A apesar de notas de aceitabilidade e motivo favorecerem aspectos de B; a revisão foi preservada, não “corrigida” pelo agente. Os casos incertos 5 e 21 e o item 30 não contam como erros de preferência.

O Jev continuou escolhendo entre respostas onde cabia equivalência. No extra, ainda preferiu B no controle 24 (ambas aceitáveis) e no 25 (ambas falham). Também escolheu o agradecimento automático no item 26, em vez da reação de constrangimento pretendida pelo autor do controle. A v3 corrigiu a preferência no controle 1 de Christina; isso é diagnóstico naquele par sintético, não prova de que reconhecerá todas as provocações reais.

## Notas absolutas: melhora em persona, falhas em expressão

“Concordância definitiva” considera apenas notas pessoais aprova/reprova. Uma decisão incerta do Jev em caso definitivo conta como abstenção, não aprovação. Os casos pessoais incertos são relatados separadamente.

| Critério                                  | Definitivos pessoais | Concordância v1 | Concordância v2 | Reprovações pessoais aprovadas pelo Jev na v2 |
| ----------------------------------------- | -------------------: | --------------: | --------------: | --------------------------------------------: |
| Aceitabilidade                            |                   42 |           32/42 |           33/42 |                                           9/9 |
| Persona                                   |                   42 |           21/42 |           37/42 |                                          1/22 |
| Gatilho, alvo, intensidade e recomposição |                   35 |           32/35 |           33/35 |                                           2/2 |
| Expressividade                            |                   30 |            5/30 |            9/30 |                                         10/25 |

A concordância de persona da v2 chegou a 88,1% nos definitivos. Houve quatro reprovações indevidas de respostas pessoalmente aprovadas e uma aprovação de resposta reprovada. Nos 18 casos pessoais incertos de persona, Jev aprovou cinco, reprovou nove e marcou quatro como incertos. Esse critério melhorou de forma relevante, mas ainda depende de validação distinta.

Aceitabilidade e adequação emocional continuam permissivas. A alta concordância emocional esconde o fato de haver só duas reprovações pessoais definitivas e ambas terem sido aprovadas. Não transformar uma maioria de respostas aprovadas em evidência de detecção de falhas.

Em expressividade, Jev aprovou dez das 25 respostas reprovadas, reprovou quatro e se absteve em onze. Também aprovou 26 dos 30 casos que o proprietário considerou incertos. Acertar as cinco aprovações positivas não compensa essa tolerância. A avaliação de expressão não está calibrada.

## Confiança e latência

Na preferência v3, confiança reportada ≥ 0,7 deixou nove dos 27 casos, com oito acertos. ≥ 0,9 deixou apenas um caso — errado: o item 19, cujo empate foi convertido em preferência B. São observações no mesmo desenvolvimento, não limiares validados. Aumentar o corte pode reduzir cobertura e não garante correção.

O pedido ao Jev levou aproximadamente 0,45 s de mediana nesta execução serial. Isso mede a decisão pronta no cliente, incluindo rede; não mede o tempo da conversa inteira. Escolher entre duas respostas prontas ainda exige esperar pelos autores antes de julgar. Essa medição não autoriza prometer seleção sem atraso nem remover o verificador factual.

## Expressões e próxima intervenção

O repertório pedido já existe na direção expressiva. O problema observado é atuação e escolha de reação: validação genérica no lugar de resposta própria, pouca exasperação contextual, aceitação de tratamento servil, constrangimento fraco e transições que perdem o reparo. Uma porcentagem de “Hmm…” não mede fidelidade.

Os [candidatos de revisão](../../code/backend/evals/persona/quality-v6/expressive-candidates-review.md) demonstram sequências de provocação/reparo, firmeza, elogio, dúvida, surpresa/alegria, tristeza e ceticismo. São novos exemplos de desenvolvimento, separados das fichas do juiz. Incluem micro pausas pertinentes e versões diretas possíveis, sem bordão obrigatório. Não foram promovidos à produção nem testados com os autores nesta tarefa.

O próximo experimento de atuação deve manter modelo, núcleo e amostragem iguais e variar somente exemplos com sequência e função. Validar novas falas, incluindo recuperação após desculpa, elogio sem insinuar perversão, erro de transcrição sem hostilidade e humor sem ferir alguém em sofrimento. Para o juiz, novos pares pessoalmente avaliados precisam incluir mais empates, ambas falhas e reações sutis; o conjunto atual não aprova o seletor.

Não usar decisões do próprio Jev como novos rótulos verdadeiros, não editar o prompt automaticamente e não atribuir melhoria dos pesos das LLMs a esse ciclo. Um ensaio de comparação em segundo plano permanece possível, mas escolha audível deve esperar ganho demonstrado sobre autores fixos e avaliação independente. Nenhuma troca do modelo principal foi realizada.

## Orçamento, artefatos e validação

184 chamadas pagas ao Jev, nenhuma falha ou custo desconhecido novo. Entrada total: 434.883 tokens. Custo efetivo novo: **US$ 0,018265086**. Somado ao comprometimento anterior de US$ 0,3411052648, o agregado ficou em **US$ 0,3593703508**, abaixo dos US$ 0,38 autorizados; restam **US$ 0,0206296492**. A reserva desconhecida anterior de US$ 0,00393068 continua contabilizada. O orçamento não foi reiniciado entre revisões.

Arquivos locais ignorados: `code/backend/api/data/refinement/jev-calibration-owner-2026-10-08/`. Contêm os documentos originais, notas e hashes, alteração confirmada do item 30, respostas brutas `jev-results*.json`, contextos, probabilidades, custos, auditoria `calibration-audit.json` e divergências `preference-disagreements-v3.md`. Nenhuma chave foi copiada para os relatórios. A autorização do teto e o registro financeiro anterior foram preservados no diretório da rodada controlada.

Importação com verificação de IDs e conteúdo; teste de proteção financeira sem chamada; 12 testes locais pertinentes aprovados; typecheck e lint dos arquivos novos aprovados. Não houve Cartesia, STT, teste vocal, fine-tuning, alteração de memórias pessoais ou de configuração de produção. O resultado desta tarefa é a calibração medida e seu limite, não a aprovação final da naturalidade.
