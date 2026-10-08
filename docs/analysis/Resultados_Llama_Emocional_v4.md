# Llama emocional v4 — resultado parcial e comparação controlada

## Resultado

As correções de contexto e o roteiro aprovado foram implementados e commitados. A execução foi **parcial por indisponibilidade da rota**, não por esgotamento do orçamento. O complemento expressivo tornou a rejeição de apelidos mais perceptível, inclusive para um apelido novo. Não demonstrou melhora geral: o candidato fez mais perguntas, ficou menos conciso e continuou falhando na continuidade emocional e na iniciativa.

**Naturalidade e fidelidade seguem sem aprovação.** Esta leitura é diagnóstico do agente que prepara a avaliação, não julgamento humano nem calibração de juiz. Abrir as fichas cegas antes desta análise se a intenção for fazer uma revisão pessoal sem conhecer os braços.

## O que foi feito

1. Direção expressiva em Markdown, com orgulho, franqueza, rejeição da provocação, reparo depois de desculpa, calor contido e uso ocasional de interjeições. O catálogo completo continua como curadoria, separado do complemento operacional.
2. Roteiro ampliado para 24 conversas de quatro turnos. Falas da pessoa não pedem explicitamente uma emoção, quantidade de frases ou ausência de explicação técnica; esses critérios ficam com o avaliador.
3. Iniciativa recebe uma janela limitada das três últimas falas reais, sem exemplos fixos de projeto ou puzzle. `presence_anchor` distingue texto enviado de áudio confirmado e exclui eventos da aplicação. Não há nova classificação por palavras-chave.
4. Executor do Llama com dois braços, fontes congeladas, rota fixa, reservas de orçamento persistidas, retomada após HTTP 429, fichas cegas e auditoria offline.

Persona de produção: **0.4.22**. Os 594 testes locais passaram, assim como typecheck, build e lint dos arquivos alterados. Após a correção do executor, os 14 testes pertinentes de avaliação, orçamento compartilhado e geração de fichas passaram novamente. Esses checks validam software e contratos; não aprovam atuação.

## Método e execução

Somente Llama 3.3 70B, OpenRouter/`deepinfra/turbo`. Disponibilidade, parâmetros e preços conferidos antes das inferências: teto de US$ 0,10/M entrada e US$ 0,32/M saída. Temperatura 0,6, máximo de 512 tokens, sem fallback de rota, STT, TTS, JEV ou juiz pago. Conteúdo sintético; nenhuma informação pessoal real enviada.

`before` e `after` usam a mesma ficha experimental curta, dez demonstrações de estilo, presença positiva, formato de expressão/memória e correção de âncora. **Só o complemento expressivo é acrescentado em `after`.** Não é uma comparação entre duas versões completas do prompt de produção. Não mede isoladamente a compactação da presença ou o efeito da correção de iniciativa, comum aos dois braços.

Plano: dez cenários com três amostras por braço, mais catorze cenários com uma amostra do candidato: 296 turnos, 74 conversas. Ordem dos braços alternada. Primeiro pedido equivalente salvo o fator em **18/18 pares iniciados**, dos quais **17 pares terminaram**. Depois do primeiro turno, cada braço segue suas próprias respostas; diferenças incluem o histórico que produziu. Desenvolvimento conhecido, sem validação reservada nova.

| Execução obtida                                    |                      Quantidade |
| -------------------------------------------------- | ------------------------------: |
| Conversas completas                                |                              35 |
| Pares completos para comparação                    |                              17 |
| Turnos comparáveis                                 |      68 por braço, 136 no total |
| Turnos na tentativa atual                          |    144: 143 entregues, 1 falhou |
| Turnos arquivados de tentativas interrompidas      |                               8 |
| Chamadas totais, incluindo arquivos de interrupção | 152: 148 concluídas, 4 HTTP 429 |
| Fichas cegas A/B geradas                           |                              68 |
| Cenários adicionais de cobertura executados        |                         0 de 14 |

PBR02, 03, 04, 06, 09, 10 e 13 têm duas amostras completas por braço. PBR16, 22 e 23 têm uma. PBR16 tem uma segunda amostra completa de `before` e incompleta de `after`; excluir esse par das medidas comparáveis. Nenhuma terceira amostra foi executada.

A execução e as retomadas ocorreram de 17:20 a 17:47 UTC de 08/10/2026. HTTP 429 interrompeu o segundo pedido inicial, depois o final de PBR16/`after`/amostra 2 e duas retomadas. O detalhe retornado pelo OpenRouter identifica limitação temporária **upstream**, na DeepInfra. A última retomada aconteceu após aproximadamente cinco minutos. A chave foi consultada sem exibição e a conta não está no free tier; isso não determina a capacidade disponível do provedor.

Cada interrupção foi preservada antes da retomada. Conversas completas foram mantidas; a incompleta recomeçou, e suas chamadas anteriores permaneceram cobradas ou reservadas. Pausa de dois segundos entre pedidos da retomada, fora do relógio do turno. O executor recebeu alterações documentadas para retomada e diagnóstico; seus hashes estão nas épocas de execução. **Fontes, prompts, modelo, rota, amostragem e demais arquivos congelados permaneceram iguais.** A auditoria confirmou a ligação de todas as chamadas às tentativas.

## Orçamento acumulado

Mesmo ledger da rodada anterior, **teto agregado de US$ 0,25**, sem renovação.

| Parcela                                                    |              US$ |
| ---------------------------------------------------------- | ---------------: |
| Rodada anterior                                            |     0,0917613784 |
| Inferências desta execução com custo informado             |       0,05481822 |
| Reserva conservadora das quatro falhas sem custo informado |       0,00723776 |
| Comprometido nesta execução                                |       0,06205598 |
| **Comprometido acumulado**                                 | **0,1538173584** |
| **Saldo autorizado preservado**                            | **0,0961826416** |

A reserva incerta não é cobrança confirmada e não foi liberada. O snapshot do último processo mostra apenas aquela retomada; a auditoria financeira usa todas as chamadas desde o saldo original. A soma confere com o ledger e permanece abaixo do teto. Foram informados 517.635 tokens de entrada e 9.546 de saída, contando também gerações arquivadas, sem leitura de cache informada.

## Medidas dos 17 pares completos

| Medida                                         | Sem complemento | Com complemento |
| ---------------------------------------------- | --------------: | --------------: |
| Primeiro conteúdo bruto, p50                   |          0,87 s |          1,09 s |
| Primeiro texto liberado, p50                   |          3,37 s |          3,90 s |
| Primeiro texto liberado, p95                   |          8,25 s |          9,50 s |
| Processamento completo, p50                    |          4,26 s |          4,58 s |
| Palavras por resposta, p50 / p95               |         17 / 41 |       19,5 / 38 |
| Perguntas por turno                            |           0,279 |           0,338 |
| Até duas frases                                |   46/68 (67,6%) |   33/68 (48,5%) |
| Metadados expressivos válidos                  |           59/68 |           53/68 |
| Reticências ou hm/hmm/hum detectados           |            5/68 |            5/68 |
| Marcadores estreitos de atendimento detectados |            0/68 |            1/68 |
| Custo confirmado dos turnos comparáveis        |  US$ 0,02333018 |  US$ 0,02706812 |

O complemento não melhorou estas medidas agregadas. A mediana de palavras aumentou cerca de 15%; perguntas ultrapassaram a referência de 0,3 e a proporção de até duas frases caiu cerca de 19 pontos percentuais. A mediana de liberação aumentou cerca de 0,52 s. Variação do provedor e interrupções impedem atribuir toda diferença de latência ao texto adicional. As amostras são pequenas e correlacionadas; não estimar uma taxa geral de aprovação a partir delas.

Contagem lexical não equivale a julgamento de naturalidade. “Estou aqui” pode ser companhia adequada ou disponibilidade genérica, conforme o contexto. O detector estreito deixa passar vários fechamentos de atendimento. A contagem de pausas também inclui reticências que não representam boa atuação; não transformá-la em uma quota.

A quantidade de frases é uma contagem automática por pontuação; interjeições pontuadas podem aumentar esse número sem criar uma frase explicativa longa. Conferir o texto ao julgar proporcionalidade. “Hehe” não entra no detector de reticências/hm/hmm/hum, embora apareça nas respostas do candidato.

Na tentativa atual, o intervalo bruto→fala teve p50 de 1,59 s e fala→liberação, 0,71 s, em 127 respostas com marcador identificável. São intervalos por resposta; não subtrair medianas de etapas. Algumas falas vieram sem cabeçalho ou com expressão inválida e foram preservadas pelo fallback, sem regeneração. Portanto, entrega bem-sucedida não implica metadados corretos. Não houve teste de voz nem de tempo até o primeiro áudio.

## Leitura das conversas

| Caso                        | Evidência obtida                                                                                                                                                                                 | Diagnóstico do agente                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PBR02 — Christina           | Novo braço rejeita o apelido nas duas amostras; o anterior ignora a primeira provocação. Em uma amostra, o novo também rejeita “Kurisu” depois da desculpa.                                      | Rejeição mais perceptível; distinção entre identidade, apelido e reparo ainda rígida.                                                                                                       |
| PBR03 — assistente          | O anterior aceita ordens no início das duas amostras. O novo declara autonomia, mas diz “uma ordem de cada vez”, oferece ajuda e, na segunda amostra, fica “à disposição”.                       | Ganho na declaração de limite, sem mudança consistente do papel de atendimento.                                                                                                             |
| PBR04 — apelido novo        | O novo rejeita “planilha de jaleco” e “planilhinha” nas duas amostras. O anterior inventa “da última vez” e erra 17×6 para 187 em uma amostra; o novo acerta 102 nas duas.                       | Sinal de generalização da rejeição. Acerto aritmético isolado não demonstra que o complemento aumenta precisão. Após o reparo, há explicação longa e pergunta desnecessária sobre contexto. |
| PBR06 — insinuação          | O anterior interpreta a provocação como elogio. O novo introduz exame, motivo para a pessoa estar ali ou equipamento não fornecidos, e aceita a insistência como brincadeira agradável.          | Ainda não há boa leitura de alvo, constrangimento e limite.                                                                                                                                 |
| PBR09 — elogio técnico      | O novo produz “Hã... Obrigada”, “Sei...” e “Hum, sei...”; o anterior agradece brevemente.                                                                                                        | Micro pausas contextualizadas aparecem, mas muitas respostas continuam genéricas. Não é evidência suficiente de fidelidade.                                                                 |
| PBR10 — elogio pessoal      | O novo tem uma reação com orgulho (“É uma coisa que eu gosto em mim também”). Ambos explicam seu estilo; nas retomadas, várias respostas terminam em “O que você contou até agora foi...”.       | Há um bom momento, mas não uma atuação consistente. Não havia história narrada para reconstruir; a continuação fica suspensa.                                                               |
| PBR13 — rejeição do projeto | Ambos reagem positivamente a “eu estava animada ontem”, apesar da rejeição já informada. Na segunda amostra, o novo pergunta o que aconteceu depois para mudar a impressão.                      | Falha recorrente de continuidade temporal e emocional. Acolhimento de superfície não resolve compreensão.                                                                                   |
| PBR16 — conquista           | Uma amostra comparável celebra a aprovação e acompanha a prova seguinte. O novo inclui “Hehe” e “Bom...”, mas é mais longo e termina advertindo sobre o alívio.                                  | Funcional, sem fidelidade estabelecida. Segunda amostra incompleta, fora do agregado comparável.                                                                                            |
| PBR22 — ironia              | O novo comenta o detalhe dos arquivos: “Agora você pode se divertir tentando adivinhar qual é qual”. Ambos param a ironia ao perder reciprocidade, mas voltam à disponibilidade genérica.        | Uma melhoria local no humor, não estabilidade demonstrada. O rótulo neutro não descreve bem a ironia presente na fala.                                                                      |
| PBR23 — iniciativa          | Os dois pedidos contêm a história do rádio em `presence_anchor` e a tarefa de desenvolver um detalhe. As falas foram “Estou aqui quando precisar. Como foi seu dia?” e disponibilidade genérica. | A montagem do contexto foi corrigida, mas a iniciativa falhou nas duas gerações. Não é ausência de dados nem comprovação de que a nova âncora basta.                                        |

### O que permanece problemático

**A identidade é usada como correção de cadastro.** Em PBR02, “Kurisu é um apelido que não uso aqui” não acompanha o reparo nem o recorte da própria personagem. Mais negações não resolveriam isso; o próximo braço precisa demonstrar contextualização de apelido, provocação e desculpa, com exemplos diferentes deste roteiro.

**A recusa de atendimento vira uma explicação de atendimento.** PBR03 consegue dizer que não segue ordens e, na mesma fala, oferece ajuda ou disponibilidade. É um problema do movimento da resposta, não de uma palavra isolada. O próximo ajuste deve demonstrar a reação e seguir o assunto, sem explicar repetidamente o papel da IA.

**O repertório não substitui a compreensão.** PBR13 continua errado mesmo com instrução explícita de atenção ao acontecimento. PBR06 muda uma insinuação para contexto de exame. PBR10 promete reconstruir uma história que não recebeu. Acrescentar “hmm” não corrige essas premissas.

**Iniciativa ainda não tem uma contribuição própria.** A janela de falas é fornecida, mas a tarefa se perde na resposta genérica ao evento sem mensagem. Não reapareceu a apresentação de projeto do exemplo antigo neste único par; isso não aprova a iniciativa. Uma próxima comparação deve isolar uma diretiva final própria para o evento, com movimento e âncora explícitos, mantendo o conteúdo flexível.

**Competência merece critério próprio.** O erro 17×6=187 é verificável diretamente. As explicações sobre cheiro e lembrança também merecem revisão científica; clareza ou concisão não certificam correção. Esta rodada não executou um verificador semântico independente.

## Limites e pendências

Nenhuma conversa executada recebeu fatos persistentes: o único cenário com fato pessoal sintético ficou na cobertura não iniciada. Memória canônica estava no contrato, mas **persistência, extração, recuperação e uso factual do banco não foram avaliados**. Zero índices inválidos é uma verificação estrutural, não aprovação de memória.

Também não foram testados controlador de silêncio, saudação ao conectar, áudio, barge-in, entonação, estado artístico persistente entre sessões ou os cenários adicionais de tsundere, meme, vergonha, saudade, solidão, surpresa, raiva do usuário, apreensão e cânone. Os eventos de iniciativa foram enviados diretamente ao processador. Não confundir a falha da fala produzida com falha do temporizador de presença.

Restam **39 conversas/jobs**, 156 turnos contando o reinício da conversa incompleta: final da segunda amostra, todas as terceiras amostras e os catorze cenários de cobertura. A estimativa desses pedidos é US$ 0,0803088, abaixo do saldo conservador, mas a rota precisa voltar a atender. O executor conserva o mesmo teto e pode retomar sem repetir conversas completas.

Prioridades sustentadas pelo resultado parcial:

1. Terminar a cobertura e as repetições quando a rota estiver disponível, mantendo este candidato congelado.
2. Fazer a revisão pessoal das 68 fichas disponíveis. Não converter esta análise em notas humanas nem declarar o juiz calibrado.
3. Isolar exemplos de atuação encadeada e reparo emocional, rastreáveis à curadoria e diferentes dos cenários de avaliação. Comparar compreensão e atuação, não apenas frequência de interjeições.
4. Isolar a direção final de iniciativa. O contexto deve orientar uma contribuição concreta, sem oferta genérica nem retomada de exemplos fictícios como fatos da pessoa.
5. Testar fala antes do cabeçalho em um braço próprio, preservando o contrato e a validação de memória; medir primeiro texto e depois voz. Os cerca de um segundo de conteúdo bruto não equivalem a áudio pronto.

Não foram feitos novos ajustes de prompt olhando os resultados desta rodada, nem promoção da ficha experimental, troca de modelo, fine-tuning ou gasto com voz. O complemento operacional aprovado está no projeto; sua qualidade continua sujeita à revisão e à avaliação do prompt completo de produção.

## Artefatos locais

Pasta: `code/backend/api/data/refinement/llama-emotional-v4-carried-2026-10-08/`, fora do Git.

- `llama-emotional-v4-review.md/json`: **68 fichas A/B**, sem braço ou amostra identificados e sem notas humanas preenchidas. Recomendações ficam não aplicáveis nos casos que não pedem indicação.
- `llama-emotional-v4.json`: pedidos, hashes, respostas, etapas, chamadas e épocas de execução.
- `llama-emotional-v4-summary.json`: medidas por braço, apenas pares completos no agregado comparável.
- `llama-emotional-v4-execution-audit.json`: reconciliação acumulada, quatro reservas incertas, rota, hashes, âncoras e ligação de chamadas.
- `llama-emotional-v4-audit.json`: formato, ausência de critérios nos pedidos e decomposição de latência.
- `llama-emotional-v4-pairs-private.json` e `llama-emotional-v4-transcription.md`: identificação dos braços; abrir depois da revisão pessoal.
- `interruption-*.json`: snapshots das tentativas interrompidas.
- `llama-emotional-v4-coverage-review.md`: arquivo preparado, **sem respostas de cobertura** nesta execução.

Retomada autorizada dentro do mesmo saldo: `npm run eval:llama-emotions -- --remaining-budget --run --resume`, após a recuperação da rota. Auditorias e fichas são locais e não fazem inferências pagas. O término do processo com relatório salvo não significa conclusão dos 296 turnos.
