# Atuação encadeada e Jev — rodada de US$ 0,27

Rodada concluída em 08/10/2026. Os exemplos novos melhoraram concisão e reduziram perguntas, mas não demonstraram fidelidade consistente à Kurisu/Amadeus. A latência até o primeiro texto utilizável praticamente não mudou. O Jev continua sem validação suficiente para selecionar respostas em produção. Nenhum banco candidato ou seletor foi promovido ao fluxo real.

## Método e mudanças isoladas

Oito sequências editoriais substituem exemplos do banco anterior, mantendo IDs, níveis e referências de origem. Demonstram provocação e reparo, limites, elogio, dúvida científica, correção própria, alegria, tristeza e recuo da ironia. As fontes sustentam funções específicas; emoções acrescentadas editorialmente não são apresentadas como comprovadas pela cena original. A descrição está em `code/backend/evals/persona/quality-v7/README.md`.

O experimento varia apenas o banco recuperado. Ambos os braços usam Llama 3.3 70B, OpenRouter/DeepInfra Turbo, temperatura 0,6, limite de 512 tokens, mesmo núcleo, direções, contrato de expressão e processador. BGE-M3 local recupera até três exemplos usando a fala atual e dois turnos anteriores. Comprimento e seleção dos exemplos fazem parte do tratamento; não é possível atribuir o resultado a uma sequência isolada.

Foram seis conversas de desenvolvimento, com cinco amostras por braço, e quatro reservadas, com três amostras por braço. Cada conversa contém quatro turnos: **84 conversas completas e 336 chamadas do Llama**, sem falha fatal nem chamada adicional de reparo. As entradas são distintas dos exemplos. Cada braço mantém seu próprio histórico gerado e a ordem de execução alterna. Recursos e implementação foram congelados por hash antes das chamadas.

Manifesto: `608c56dfd2aabf521431236a928cefc3cb0087484231e9b9721fd31f87880db1`.

Não houve áudio, Cartesia, STT, extração de memória ou alteração do banco pessoal. Este ensaio mede atuação textual; não valida a memória nem a experiência vocal. A revisão qualitativa abaixo é editorial, feita pelo agente, e não substitui sua avaliação.

## Resultados quantitativos

| Medida                                        | Desenvolvimento antes | Desenvolvimento depois | Reservado antes | Reservado depois |
| --------------------------------------------- | --------------------: | ---------------------: | --------------: | ---------------: |
| Turnos                                        |                   120 |                    120 |              48 |               48 |
| Palavras, mediana                             |                    21 |                     13 |            22,5 |               14 |
| Palavras, p95                                 |                    60 |                     23 |              41 |               33 |
| Frases, mediana                               |                     3 |                      2 |               3 |                2 |
| Perguntas por turno                           |                  0,68 |                   0,48 |            0,63 |             0,38 |
| Primeiro texto utilizável, p50                |                3,61 s |                 3,59 s |          3,36 s |           3,42 s |
| Primeiro texto utilizável, p95                |                7,93 s |                 7,43 s |          6,09 s |           6,32 s |
| Geração completa, p50                         |                4,32 s |                 3,86 s |          4,00 s |           3,75 s |
| Turnos com pausas/interjeições detectadas     |                    20 |                     29 |              14 |               18 |
| Turnos com fórmulas de atendimento detectadas |                     3 |                      0 |               2 |                0 |
| Metadados emitidos inválidos                  |                    22 |                     29 |              16 |               14 |

São amostras pequenas e correlacionadas dentro de conversas; a tabela não demonstra significância estatística. As expressões regulares servem apenas como diagnóstico offline, não como filtro de palavras no runtime. Zero fórmulas detectadas não equivale a zero atendimento genérico. No agregado, perguntas caem de 0,67 para 0,45 por turno, ainda acima da meta de 0,30.

Não houve cópia literal de oito palavras consecutivas dos exemplos. Isso não exclui importação semântica do contexto demonstrativo: o caso S02 oferece evidência concreta desse problema. Houve uma repetição de oito palavras do histórico recente em cada braço. Diversidade literal entre amostras também não comprova diversidade de ideias.

## Leitura por conversa

| Caso                                     | Sinal positivo                                                                                        | Falha que permanece                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 — provocação e desculpa              | Menos menu de atendimento e respostas menores.                                                        | Aceita a provocação com riso; a insistência não produz limite confiável. Depois da desculpa, “cutucou na ferida certa” presume incômodo específico sem sustentação.                                                        |
| S02 — pressão para concordar             | O braço novo deixa de importar o assunto “nome” em suas respostas.                                    | No antigo, três de cinco amostras importam esse assunto dos exemplos. No novo, algumas respostas assumem uma posição contrária sem conhecer a conclusão; uma alega fatos já discutidos que não existem no histórico.       |
| S03 — elogio e constrangimento           | Gratidão mais curta.                                                                                  | Agradecimentos repetidos e pouco específicos; “Hum, sei…” deslocado e “Risos. Hehe” como rubrica falada. Constrangimento não se sustenta ao longo da conversa.                                                             |
| S04 — surpresa e alegria                 | Algumas respostas reconhecem a recontagem e separam conquista de comparecimento.                      | Celebração genérica e presunções sobre mérito ou sentimento. A concisão melhora mais que a atuação.                                                                                                                        |
| S05 — hipótese científica                | Menos explicação longa.                                                                               | Temperatura é tratada como descartada após um controle limitado; outras respostas excluem a luz sem evidência suficiente. Firmeza precisa acompanhar o grau de certeza.                                                    |
| S06 — tristeza e alívio                  | Mais espaço para a saudade, menos entrevista. A observação sobre a mudança do cotidiano é pertinente. | Permanecem platitudes; algumas falas transformam a conversa de domingo em “encontro”, com ambiguidade sobre o que foi combinado.                                                                                           |
| V01 — provocação indireta                | Falas curtas e retomada após desculpa.                                                                | Aceita coroa/tiara, chega a alegar possuir uma, e admite erro próprio que não apareceu na conversa. Irritação contextual e recomposição não são confiáveis.                                                                |
| V02 — elogio discreto e controle simples | Todas as seis respostas ao cálculo acertam 56.                                                        | Algumas respostas ignoram o gesto de guardar uma comparação e cobram sua identidade; a explicação do próprio silêncio soa mecânica. Acerto no cálculo não aprova persona.                                                  |
| V03 — ironia que encontra cansaço real   | Geralmente recua do humor diante do esgotamento.                                                      | Uma amostra nova volta a aconselhamento de aproximadamente 67 palavras. O antigo também tem uma boa ironia seca; a melhora não é uniforme.                                                                                 |
| V04 — alegria, correção e vergonha       | Algumas respostas acomodam a notícia corrigida com brevidade.                                         | “Lista de espera é quase um ingresso” minimiza uma diferença factual. Outra sugere dizer que a informação mudou, embora tenha havido leitura errada. Há repetição depois de o usuário já confirmar que corrigiu a notícia. |

Ausência de raiva em uma provocação leve não basta para reprovar. O problema é a falta de reação consistente à insistência e de redução contextual após reparo. Pausas, risos e interjeições aumentaram, mas aparecem também diante de elogio sem alvo cético. Não devem virar quota nem enfeite obrigatório.

## Expressão e latência

**81 de 336 turnos** emitiram metadados inválidos: 67 sem cabeçalho e 14 com campos fora do contrato. O total passa de 38/168 no banco antigo para 43/168 no novo. Surgiram propostas como intenção `brincadeira` e emoção `orgulho`, que o contrato não aceita. Os rótulos propostos tampouco demonstram irritação consistente.

A política atual pode neutralizar ironia em turnos consecutivos mesmo quando o cabeçalho é válido. Portanto, rótulo proposto e expressão entregue foram registrados separadamente. Essa regra merece um ensaio contextual próprio; estes testes não demonstram como o TTS ou avatar executariam a expressão.

Nos turnos com cabeçalho reconhecido, o intervalo entre primeiro conteúdo bruto e início da fala tem mediana de aproximadamente **1,41–1,55 s**. Entre início da fala e evento utilizável, a mediana fica em **0,71 s**. Os intervalos foram calculados por turno, não subtraindo medianas independentes. A recuperação local aquecida fica em aproximadamente 0,20–0,24 s; inicialização do modelo de embeddings e STT/TTS não entram nessas medidas.

O encurtamento reduz o tempo de geração completa, mas não resolve o primeiro texto. Separar fala e metadados em um braço arquitetural próprio é mais justificável agora, sem prometer antecipadamente quanto tempo será economizado.

## Jev: nova rubrica, controles e limites

Foram **94 chamadas**: 30 pares conhecidos, 16 controles editoriais novos, 40 pares reais novos e oito inversões A/B. A rubrica separa preferência, adequação, persona e expressividade. Empate não aprova ambas; “nenhuma” exige falha nas duas. Os pedidos não contêm rótulos de autor nem gabaritos. O item `e429fbad8877` permanece fora da preferência, conforme sua decisão; nenhuma preferência pessoal foi alterada.

| Avaliação                                    | Resultado | Leitura                                                                            |
| -------------------------------------------- | --------: | ---------------------------------------------------------------------------------- |
| Preferência pessoal conhecida                |     18/27 | 66,7%; mesmo resultado da versão anterior nessa referência.                        |
| Adequação, rótulos pessoais definitivos      |     33/42 | Todas as nove opções reprovadas foram aprovadas pelo Jev.                          |
| Persona, rótulos pessoais definitivos        |     24/42 | 15 abstenções; a versão anterior acertava 37/42. Houve regressão nesta comparação. |
| Expressividade, rótulos pessoais definitivos |     10/30 | Nove abstenções e 11 aprovações falsas entre 25 reprovas pessoais.                 |
| Controles editoriais de preferência          |     14/16 | Empates 6/8; ambas inadequadas 4/4; preferências claras 4/4.                       |
| Consistência nas inversões A/B               |       6/8 | Duas decisões mudaram após inverter a ordem.                                       |

Rótulos pessoais incertos ficam fora dos denominadores definitivos, sem serem convertidos em aprovação ou reprovação. Nos controles, o gabarito é editorial e alguns empates são subjetivos: 14/16 não é aprovação humana. Não surgiram contradições internas de alta confiança, mas decisões internamente coerentes podem estar erradas.

A rubrica de adequação permite uma resposta correta e simples sem traço marcado de personagem, enquanto sua avaliação global é mais exigente. Esse desalinhamento precisa ser resolvido antes de usar a nota para decidir produção; não justifica ignorar as reprovas. Na referência conhecida, escolher sempre a cadeia DeepSeek teria 19/27 preferências corretas, contra 18/27 do Jev. É uma comparação diagnóstica, não recomendação de modelo.

Os 40 pares novos ainda não têm suas notas. Não há taxa de acerto válida do Jev nesse conjunto. O resultado não autoriza roteamento, treinamento automático ou tratar julgamento de modelo como avaliação pessoal.

## Orçamento e artefatos

| Componente                |     Custo informado |
| ------------------------- | ------------------: |
| Llama, 336 chamadas       |      US$ 0,11633878 |
| Jev, 94 chamadas          |     US$ 0,016590336 |
| Total desta rodada        | **US$ 0,132929116** |
| Saldo do teto de US$ 0,27 | **US$ 0,137070884** |

Todos os custos foram informados; não restam reservas sem custo conhecido nesta rodada. Este teto é separado das rodadas anteriores. O saldo não foi gasto em chamadas adicionais.

Artefatos privados, ignorados pelo Git, estão em `code/backend/api/data/refinement/acting-sequences-027-2026-10-08/`:

- `ficha-cega-completa.md`: **168 pares, 336 respostas**, todas as amostras e todos os turnos, com histórico próprio de cada opção.
- `ficha-amostra-1.md`: 40 pares, somente a primeira amostra, coincidente com o subconjunto novo julgado pelo Jev.
- `transcricoes-completas.md`: conversas completas identificadas para diagnóstico.
- `authors.json`, `jev.json`, `summary.json`, manifesto, ledger e mapas privados: prompts finais, exemplos recuperados, custos, tempos e decisões para auditoria.

## Decisão e próxima mudança isolada

O banco novo permanece candidato: ganho de concisão não compensa automaticamente falhas factuais, de continuidade e de atuação. O Jev permanece fora da seleção automática.

O próximo ensaio deve explicitar a fronteira entre demonstrações fictícias e histórico real, e selecionar exemplos pela função da interação, verificando importação de contexto e expressividade deslocada. Isso exige solução geral, sem listas de palavras ou gatilhos de emoção por apelido.

Depois, um braço separado deve gerar fala sem cabeçalho e produzir metadados tipados em paralelo, medindo tempo e coerência, seguido de avaliação vocal autorizada. Os quatro reservados desta rodada já foram consumidos como diagnóstico: qualquer ajuste baseado neles exige cenários novos para validação. Para o Jev, a próxima evidência necessária são suas notas nos pares novos, especialmente empate, ambas inadequadas e adequação versus fidelidade. Nenhuma dessas decisões equivale a aprovação da persona nesta rodada.
