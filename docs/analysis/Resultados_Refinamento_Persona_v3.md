# Resultados do refinamento da persona — v3

**A rodada encontrou um ganho de latência e sinais de melhor leitura da memória, mas não aprovou naturalidade ou fidelidade do Llama.** As falhas nos diagnósticos novos impedem adotar todo o candidato como uma melhoria geral. A produção permanece preservada.

## Execução e orçamento

Executada em 08/10/2026, entre 11:08:59 e 11:50:27 UTC, aproximadamente 41,5 minutos. Plano e hipóteses: [Refinamento_Persona_v3.md](Refinamento_Persona_v3.md).

Foram programados 696 turnos de autor. Houve **656 turnos tentados, 621 respostas concluídas e 680 chamadas**, incluindo 16 observações de expressão e tentativas de reparo. Quarenta turnos subsequentes não foram executados porque a conversa foi interrompida por uma falha anterior. O plano chegou ao último cenário, sem atingir o teto.

| Contabilidade                                           |             US$ |
| ------------------------------------------------------- | --------------: |
| Custo informado pelas APIs                              |     0,155638665 |
| Reservas conservadas de 44 chamadas sem custo informado |     0,057892170 |
| Total contabilizado da rodada                           | **0,213530835** |
| Teto autorizado                                         |     0,250000000 |
| Saldo não utilizado                                     | **0,036469165** |

Não há reservas pendentes nem aumento do orçamento. As reservas de chamadas sem custo informado não demonstram cobrança efetiva desse valor. Os orçamentos anteriores não foram alterados. Nenhuma chamada de voz ou juiz de persona foi realizada.

Llama: 344 chamadas, US$ 0,1265932 informados e US$ 0,02841246 conservados. DeepSeek: 336 chamadas, US$ 0,029045465 informados e US$ 0,02947971 conservados. Foram reportados zero tokens de leitura de cache no Llama e 858.752 no DeepSeek; isso não prova ausência de qualquer otimização interna não reportada pelo provedor.

## Comparações isoladas do Llama

Cada linha utiliza somente conversas completas comuns aos dois braços. Os denominadores variam e as linhas não formam um ranking. Cinco amostras por caso não são cinco usuários independentes.

| Fator                                                          | Conversas pareadas | Primeiro texto utilizável p50, antes → depois | Palavras p50, antes → depois | Perguntas por turno, antes → depois |
| -------------------------------------------------------------- | -----------------: | --------------------------------------------- | ---------------------------- | ----------------------------------- |
| Retirar demonstrações com fatos sintéticos                     |                 26 | 3,46 → 3,95 s                                 | 19 → 21                      | 0,205 → 0,141                       |
| Trocar somente o complemento de atuação por direções positivas |                 24 | 3,78 → 3,56 s                                 | 21 → 23                      | 0,153 → 0,083                       |
| Colocar os mesmos fatos imediatamente antes da fala atual      |                  8 | 3,43 → 4,26 s                                 | 23,5 → 24,5                  | 0,208 → 0,292                       |
| Fala sem cabeçalho, com observador de expressão paralelo       |                  4 | **3,57 → 1,87 s**                             | 25 → 16,5                    | 1,083 → 0,833                       |

As direções positivas reduziram perguntas nos casos de desenvolvimento, mas aumentaram ligeiramente o comprimento. Elas não demonstraram generalização: nos quatro diagnósticos novos, a combinação candidata ainda devolveu escolhas, inventou uma leitura recente e perdeu a âncora da iniciativa. Não se deve confundir poucos pontos de interrogação no desenvolvimento com aprovação contextual de perguntas ou de persona.

Nenhuma cópia literal de oito palavras dos exemplos foi detectada nos pares comparados do Llama. Isso não exclui contaminação temática ou transferência de premissas: no diagnóstico de correção emocional, ele acrescentou uma brincadeira com nome que não estava no histórico real, compatível com influência das demonstrações de estilo. A relação causal específica ainda precisa de um braço próprio.

## Latência e expressão

No Llama, o ensaio tem 12 respostas por formato, duas amostras de dois cenários sem fatos persistentes. Primeiro conteúdo bruto p50: 1,27 s com cabeçalho e 1,12 s sem. A diferença bruta→utilizável, calculada por turno, tem p50 de 2,31 s e 0,71 s, respectivamente. Primeiro texto utilizável p95: **6,18 → 2,79 s**; geração completa p50: **4,76 → 2,41 s**.

O ganho de cerca de 48% no primeiro texto é um sinal útil de simplificação do protocolo. Ainda não atinge a sugestão de p50 ≤ 1,5 s e não é tempo até o primeiro áudio: faltam STT/TTS. Os tempos incluem registros duráveis locais do avaliador e o agrupador real de fala.

O observador de expressão concluiu 11/12 classificações do Llama, mas chegou com atraso p50 de **2,18 s após o primeiro texto**, p95 5,57 s. Seus resultados foram apenas registrados; não foram aplicados ao avatar ou ao TTS. Esse atraso inviabiliza tratar o classificador como uma etapa que precisa terminar antes da primeira fala. O protótipo exige expressão inicial neutra e atualização posterior, ou outro mecanismo cuja latência seja medida. O ensaio não permite remover a validação factual da produção.

A comparação pareada de latência do DeepSeek não possui nenhuma conversa completa comum aos dois formatos nesta amostra. Portanto, não há conclusão correspondente para esse modelo.

## Memória: melhora parcial, falhas remanescentes

A auditoria local usa o parser real, sem nova inferência. Em todas as respostas factuais bem-sucedidas auditadas, os fatos fornecidos estavam nas mensagens finais. Não foi encontrado índice declarado fora dos fatos disponíveis.

No contraste pareado `acting` → `grounded`, os 24 turnos de cada lado receberam os mesmos fatos. Declaração válida de uso passou de **13/24 para 21/24**; declaração de não uso passou de 11/24 para 3/24. Isso mede o contrato declarado pelo autor, não comprova sustentação factual.

Na regressão da horta, o braço original negou o plano em três das cinco primeiras respostas. Sem os exemplos com fatos sintéticos, o plano foi mencionado nas quatro primeiras respostas que chegaram a produzir texto. Nesse braço houve duas conversas incompletas por falhas técnicas, uma delas sem qualquer primeira resposta. Há evidência para isolar fatos demonstrativos, com ressalva de amostra pequena e respostas que ainda extrapolam o estado do plano.

Mover os fatos também não garante leitura correta. No diagnóstico novo com fatos em inglês, o Llama respondeu em português, mas no braço `grounded` negou que Portal 2 tivesse sido mencionado, embora esse fato estivesse no pedido. As sugestões também precisam ser julgadas quanto ao atendimento dos critérios, não só ao uso declarado da memória.

Continua o problema de converter orçamento não informado em orçamento não definido. A rubrica diferencia essas afirmações; o código não reescreve respostas para mascarar a falha. Este ensaio usa fatos sintéticos já recuperados: não revalida extração, SQLite ou busca semântica de ponta a ponta.

## Estabilidade

Foram 44 chamadas sem custo informado: 28 erros HTTP 429 do DeepSeek, cinco do Llama, nove streams fechados do Llama, um do DeepSeek e uma falha genérica do DeepSeek. Streams fechados incluem abandonos pelo parser ao detectar metadados inválidos. Os textos brutos e as tentativas de reparo foram preservados.

As falhas não contam como respostas aprovadas e as comparações condicionadas ao sucesso não representam confiabilidade operacional. O corpo dos erros HTTP do roteador histórico não permite atribuir os 429 com certeza à conta ou à capacidade do endpoint. Uma próxima rodada deve registrar cabeçalhos de espera e aplicar recuo por rota, conservando o controle financeiro e o registro bruto.

## Revisão e próximos passos

Arquivo prioritário para sua revisão pessoal:

`code/backend/api/data/refinement/quality-v3-025/1791457739206-quality-v3-llama-review.md`

São **30 respostas do Llama, de dez cenários**, uma por cenário e turno, selecionadas por hash sem rótulos de qualidade. Ajuste, amostra e notas automáticas estão ocultos; a autoria Llama é conhecida. Há também trinta fichas misturadas entre autores em `*-review.md`. Leia as fichas antes de abrir transcrições e mapas privados. A [rubrica e instruções](../../code/backend/evals/persona/quality-v3/README.md) distinguem persona, concisão e sustentação.

As notas A/B/C recebidas do outro modelo permanecem como diagnóstico externo. Não foi produzida uma nota de persona por juiz nem uma nova certificação de calibração humana.

Decisão recomendada, baseada nesta rodada:

1. Manter isolamento entre fatos atuais e demonstrações; revisar exemplos de estilo que induzem premissas sobre a conversa. Avaliar recuperação de exemplos pertinentes com contexto explicitamente separado.
2. Simplificar o contrato de memória para uma representação canônica demonstrada de modo consistente, sem flexibilizar os fatos aceitos nem introduzir palavras-chave por assunto. Testar isso como fator isolado.
3. Tornar tipo e âncora da iniciativa explícitos na entrada do autor. O histórico já chega ao prompt; a iniciativa atual não o aproveita de forma confiável.
4. Manter a fala sem cabeçalho como candidato de latência, por enquanto limitado a cenários sem fatos persistentes. A integração eventual precisa preservar revisão factual, entrega de expressão, prioridade ao usuário e ser medida em voz.
5. Usar a revisão pessoal para calibrar o juiz, com validação distinta da amostra usada para ajustar a rubrica. Só então avaliar fidelidade de maneira confirmatória.

Não há justificativa para promover o conjunto completo de ajustes à produção ou declarar o Llama no limite da arquitetura. Os resultados apontam problemas específicos de demonstrações, protocolo e iniciativa, além de uma lacuna de validação humana.

## Verificação local e artefatos

Passaram 29 testes em cinco arquivos, typecheck da API e dos testes, lint dos arquivos alterados e formatação. As fontes e implementações da execução estão congeladas por hash no relatório. Os auxiliares de auditoria e seleção também registram seu hash próprio.

Relatório-base local: `1791457739206-quality-v3.json`; resumo: `*-summary.json`; auditoria: `*-memory-audit.json`; mapas privados e transcrições em arquivos separados. Todos ficam em `code/backend/api/data/refinement/quality-v3-025/`, fora do Git.
