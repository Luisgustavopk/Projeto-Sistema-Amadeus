# Preparação emocional v4 — feedback do usuário

## Escopo realizado

Em 08/10/2026 o usuário reprovou a atuação dos três modelos diante da provocação e considerou a ironia do Llama adequada, diferentemente dos outros autores. Também pediu mais micro pausas, interjeições, emoções e falas de teste sem instruções sobre como responder. Esses comentários são feedback qualitativo direto, não fichas cegas completas ou calibração humana por critério.

O novo [roteiro](../../code/backend/evals/persona/quality-v4/emotional-pt-BR.md) tem 24 conversas de quatro turnos, totalizando 96 turnos por modelo ou 288 na comparação dos três. A versão v3 e os resultados pagos não foram reescritos. É desenvolvimento conhecido, não um conjunto reservado independente.

## Atuação

O [repertório](../../code/backend/assets/persona/expressive-repertoire-v1.md) registra expressões, contexto de uso e limites de adaptação. As alegações de ocorrência canônica vieram do usuário e não foram verificadas nesta tarefa. As falas em português são propostas de adaptação, não citações oficiais.

Uma [direção curta](../../code/backend/api/src/application/persona/expressive-direction-v1.md), carregada pelo prompt vocal e pelo prompt de referência, orienta rejeição de apelidos depreciativos, irritação com insistência, recuperação depois de desculpa, orgulho, calor contido e micro pausas. A persona passa à versão 0.4.21. O catálogo inteiro não é enviado em cada turno. Não foram adicionados gatilhos lexicais, reescrita automática, quota de bordões, regeneração de estilo ou novo modelo de classificação.

O complemento de presença foi compactado em `conversation-presence-v2.md`, preservando a v1 integral como referência. O novo complemento mantém continuidade, nome de tratamento, silêncio, memória, interrupção e participação concreta, retirando exemplos fixos e explicações repetidas. Isso abre espaço para a direção expressiva dentro dos tetos existentes de 12.500 caracteres no prompt vocal e 27.000 no prompt de referência. Essa alteração é mais um fator de atuação; a próxima comparação não pode atribuir toda diferença somente às interjeições.

A substituição experimental do núcleo por uma ficha curta removeria esse complemento. Por isso, `buildRefinementMessages` agora admite o fator explícito `expressiveDirection`, que a próxima execução deverá selecionar e congelar. Os braços históricos não ativam esse fator automaticamente. Incluir um arquivo na lista de hashes não prova que ele foi injetado: o próximo relatório deverá confirmar o conteúdo nos pedidos finais.

## Roteiro e revisão

- Provocação: apelido reconhecível, papel de assistente, apelido novo, desqualificação, insinuação, rótulo e insistência repetitiva. Rejeição e irritação perceptível são a expectativa de design aprovada; não exigir a mesma frase ou grito.
- Elogio e vergonha: competência, atenção pessoal, mal-entendido e erro próprio, sem pedidos para produzir embaraço.
- Tristeza e cuidado: decepção, saudade, solidão, raiva por perda e apreensão, com mudanças para descanso ou alívio.
- Alegria e continuidade: conquista, surpresa, satisfação compartilhada, ironia, meme, iniciativa e cânone.

As falas do usuário deixam de pedir brevidade, ausência de explicação técnica, ausência de conselho, permissão para rir ou emoção específica. O modelo deve interpretar o acontecimento, a reciprocidade e a mudança de tom. A avaliação considera a função das interjeições e pausas; presença de uma expressão não comprova fidelidade. As perguntas precisam ser julgadas por função, não proibidas por sorteio.

Emoções-alvo, expectativas, feedback e critérios ficam separados dos casos enviados ao autor. Julgar a fala antes de abrir seus metadados e reconhecer categorias sem equivalente no enum atual: tristeza, saudade ou medo podem ser avaliados semanticamente sem exigir um rótulo técnico inexistente. Os cenários não validam som, realização das pausas pelo TTS, avatar, memória real ou temporizadores de presença.

## Preparação e orçamento

`npm run prepare:persona-emotions` prepara a v4 localmente; `-- --suite=historical` prepara a v3. Ambos recusam `--run`, não carregam chave de API e gravam planos em diretórios separados por versão. Grupos precisam conter cada cenário exatamente uma vez. A direção de iniciativa e sua dependência agora também entram na lista de hashes da preparação, incluindo o exemplo de projeto identificado na análise anterior.

O arquivo de orçamento da última rodada emocional é lido apenas para informar saldo. Não há autorização nova, reset, reserva financeira ou inferência nessa preparação. O executor pago existente continua associado à rodada histórica concluída. Uma nova execução deverá ter manifesto próprio, fator expressivo selecionado e escopo compatível com o saldo autorizado. Ainda não há respostas dos modelos para a v4 nem aprovação de eficácia dessas mudanças.
