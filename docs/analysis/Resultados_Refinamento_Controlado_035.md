# Refinamento controlado — expressão, iniciativa e exemplos

Rodada de 08/10/2026. Candidatos locais de avaliação; o Llama permanece principal e a produção não foi alterada. Não houve geração Cartesia, STT, voz real, fine-tuning ou envio de dados pessoais. Cenários sintéticos, autores pagos e um classificador artístico; nenhum juiz pago de personalidade.

## Cobertura e orçamento efetivos

Teto agregado de US$ 0,35, incluindo a coleta v5 anterior. Auditoria concluída, sem chamadas pendentes ou sem ligação a um turno.

| Item financeiro                             |              US$ |
| ------------------------------------------- | ---------------: |
| Coleta anterior herdada                     |     0,1290186792 |
| Custo informado das novas chamadas          |     0,2081559056 |
| Reservas mantidas de duas chamadas HTTP 429 |     0,0039306800 |
| Total comprometido no teto agregado         | **0,3411052648** |
| Saldo restante, sem reset                   | **0,0088947352** |

O custo informado total, excluindo reservas incertas, é US$ 0,3371745848. As duas chamadas HTTP 429 conservaram suas reservas. Respeitamos o recuo e retomamos somente a conversa incompleta; sete respostas anteriores bem-sucedidas e duas falhas dessas tentativas continuam contabilizadas. Não há hipótese de reembolso no ledger.

Foram concluídos 306 novos turnos de autor: 60 nos braços do Llama, 12 na validação nova e 234 na continuação emocional, mais catorze classificações artísticas. Há 330 chamadas registradas, incluindo retomadas e um reparo de formato. Os três contrastes isolados e a validação nova terminaram.

A continuação concluiu treze das catorze conversas faltantes nos três modelos. Somada às dez anteriores, a cobertura das **24 conversas emocionais novas** chegou a **23/24**, com **136 turnos por modelo e 408 respostas**. PBR47 mantém as duas perguntas removidas pelo usuário. Ficou pendente **PBR46**, seis turnos por modelo, sobre fechar a chamada, ausência e retomada. O executor parou em `BUDGET_GROUP_MARGIN`: o saldo não comportava a projeção de um grupo completo mais margem. Não houve falha escondida tratada como conversa aprovada.

Esse conjunto de 24 conversas novas é a ampliação emocional. Não confundir com as outras 24 regressões antigas da suíte de 48; elas não foram todas reexecutadas aqui.

## Comparação emocional, candidato after inalterado

União das duas coletas, com núcleo, direção, banco, rota e parâmetros conferidos. As entradas iniciais coincidem por hash entre modelos em todas as 23 cenas comuns; depois os históricos divergem conforme as respostas de cada autor.

| Medida — 136 turnos por modelo          |       Llama |    DeepSeek |        Qwen |
| --------------------------------------- | ----------: | ----------: | ----------: |
| Primeiro texto utilizável p50           |      3,89 s |      1,92 s |      3,36 s |
| Primeiro texto utilizável p95           |     11,53 s |      5,01 s |      5,61 s |
| Palavras, mediana                       |          26 |        19,5 |          22 |
| Perguntas por turno                     |        0,49 |        0,11 |        0,43 |
| Metadados de autor válidos              |      84/136 |     123/136 |      99/136 |
| Cópia literal de exemplos detectada     |           0 |           0 |           0 |
| Custo informado dos autores nessa união | US$ 0,05951 | US$ 0,05307 | US$ 0,19276 |

Custos da última linha excluem os braços isolados, os quatro itens reservados e o observador artístico; incluem tentativas do autor ligadas à cobertura. Há ainda US$ 0,00393 de reservas incertas do Llama. O custo financeiro agregado acima abrange todas as operações autorizadas.

O contraste de fala simples usa catorze turnos do Llama em outros braços. Não comparar seus 1,74 s diretamente com os 136 turnos dos outros modelos para declarar um vencedor. A tabela emocional usa o mesmo formato com cabeçalho e o candidato histórico nos três autores. Uma amostra por cena, duas coletas e variação de provedor continuam sendo limitações. Não há nota calibrada de fidelidade, aprovação humana ou certificação vocal.

## Leitura dos braços isolados

| Experimento no Llama                  | Controle                | Candidato               | Leitura                                                       |
| ------------------------------------- | ----------------------- | ----------------------- | ------------------------------------------------------------- |
| Primeiro texto utilizável, formato    | p50 2,80 s / p95 4,54 s | p50 1,74 s / p95 4,10 s | Sinal favorável à fala simples, sem comprovar tempo até áudio |
| Palavras, formato                     | Mediana 15              | Mediana 13              | Concisão ligeiramente melhor                                  |
| Perguntas por turno, formato          | 0,21                    | 0,14                    | Não é aprovação de naturalidade                               |
| Primeiro texto utilizável, iniciativa | p50 4,45 s              | p50 4,42 s              | Sem ganho relevante                                           |
| Perguntas por turno, iniciativa       | 1,63                    | 1,25                    | Inclui todos os turnos da conversa; continua acima da meta    |
| Primeiro texto utilizável, exemplos   | p50 3,61 s              | p50 4,24 s              | Recuperação não trouxe ganho de mediana nesta amostra         |
| Palavras, exemplos                    | Mediana 16              | Mediana 21,5            | Candidato mais prolixo                                        |
| Perguntas por turno, exemplos         | 0,13                    | 0,38                    | Sinal desfavorável                                            |
| Tokens de entrada, exemplos           | 30.008                  | 24.810                  | Redução de 17,3%; economia não comprova atuação melhor        |

São três pares completos de conversas no formato (14 turnos por braço), dois na iniciativa (oito por braço) e dois nos exemplos (oito por braço). Ordem alternada onde há repetição, temperatura 0,6, mesma rota e limites. Cada braço segue seu próprio histórico. Amostra pequena e cenários conhecidos: diferenças não certificam generalização, nem permitem escolher um modelo por personalidade.

A tabela usa medianas marginais de cada braço. A mediana das diferenças por turno pareado é outra medida: −0,66 s para fala simples, +0,78 s para a diretiva de iniciativa e −0,90 s para exemplos contextuais. Nesse último braço, alguns pares aceleram, mas o carregamento frio e os demais atrasos mudam a mediana do conjunto. Não selecionar a medida mais favorável nem concluir que todos os turnos melhoraram.

### Fala primeiro, expressão depois

O contraste removeu o cabeçalho do autor e das demonstrações correspondentes; não mede apenas o custo do parser. O tempo começa antes da preparação do turno. O candidato liberou fala sem aguardar a classificação artística da primeira fala e registrou separadamente o encerramento do autor e do observador.

O primeiro conteúdo bruto teve p50 1,03 s com cabeçalho e 0,95 s sem ele. O primeiro texto de fala detectado teve p50 2,15 s no controle (dez medições disponíveis) e 0,95 s no candidato (catorze). O texto liberado pelo processador chegou a 2,80 s e 1,74 s. São medianas de eventos, não uma soma de durações por etapa; mostram que a liberação/segmentação ainda acrescenta espera depois de haver fala disponível. STT, síntese e reprodução não entram nesses números.

O autor com cabeçalho produziu metadados estruturalmente válidos em 10/14 turnos. A fala simples não possui metadados de autor por definição; o observador paralelo retornou 14/14 resultados válidos. Seu atraso mediano depois do primeiro texto foi aproximadamente 1,00 s, com p95 1,78 s. Isso confirma o contrato estrutural, não que a emoção escolhida combina com a fala.

Um protótipo opt-in em `observed-speech.ts` entrega expressão inicial neutra, texto sem bloquear e atualização tardia. Interrupção ou fechamento do consumidor cancela essa atualização. Não foi conectado à produção nem ao executor já congelado: os testes locais verificam o mecanismo, e a coleta paga usa o observador do avaliador. `deliveryApplied: false` é preservado; uma classificação posterior não pode mudar áudio já sintetizado.

Esse modo recusa fatos persistentes. A revisão factual da memória não é removida para conseguir um número menor de latência. Para integrar a fala simples em produção será preciso definir e testar separadamente como o uso de fatos é declarado e conferido, mantendo o caminho protegido durante a transição.

A atuação ainda falha: a fala simples teve melhor recomposição no caso de apelido e pedido de desculpas, mas conserva agradecimentos e ofertas genéricas em elogios. Uma execução com cabeçalho rejeitou o nome Kurisu e inventou que havia escolhido seu nome. Não há aprovação de fidelidade.

### Iniciativa ancorada

A diretiva adicional usa o evento de iniciativa da aplicação, um movimento de observação e as três últimas falas reais como âncora. Não classifica intenção por palavras-chave. A recuperação de uma âncora melhorou a relação com o assunto, mas não corrigiu o modo consultoria.

Nas duas iniciativas do controle apareceram uma checagem genérica e uma pergunta de planejamento com menu. As duas iniciativas do candidato mantiveram o rádio da história, porém perguntaram como a pessoa pretendia desenvolver a trama. O modelo recebeu uma direção para concluir uma ideia e ainda assim transferiu o trabalho à pessoa. **Não promover esse candidato como iniciativa natural.**

Os picos permaneceram altos: p95 27,98 s no controle e 32,98 s no candidato, considerando todos os turnos. Há atrasos grandes já no primeiro conteúdo bruto do provedor; não se pode atribuir toda a demora ao cabeçalho ou à segmentação.

### Exemplos por embeddings

O controle recebe dez exemplos de estilo; dois exemplos de contrato de memória do mesmo banco são filtrados pelo construtor e não contam como demonstrações de atuação. O candidato seleciona até três desses mesmos dez exemplos usando BGE-M3 local, consulta atual e duas falas anteriores. Pode selecionar nenhum; não recebe a resposta esperada, o identificador do cenário ou rótulos de avaliação.

A busca aquecida levou aproximadamente 48–250 ms, mediana 160 ms. O primeiro carregamento demorou 2,67 s e entrou na latência do primeiro turno. Esse efeito deve ficar explícito em qualquer comparação.

O subconjunto economizou contexto, mas algumas reações pioraram: ceticismo diante de elogio sincero, entrevista genérica depois de um pedido de desculpas e oferta de ajuda ao encerrar um elogio. **A seleção semântica é flexível, mas proximidade textual não garante compatibilidade da reação.**

O banco fixo de estilo não contém “Christina” nem “laboratório”. “Christina” consta da direção expressiva e do próprio cenário de desenvolvimento; a hipótese de cópia literal do banco não foi comprovada. “Meu laboratório” também não estava no prompt inicial auditado. Não atribuir uma falha a uma fonte apenas porque ela parece plausível.

## Contrato e capacidade de expressão

A auditoria usa o schema existente. Uma proposta bruta inválida continua identificada como inválida, mesmo quando o processador emite um evento neutro de fallback. O relatório separa presença do cabeçalho, proposta bruta, validação e evento efetivamente emitido.

Irritação e constrangimento podem ser estruturalmente válidos e ainda resultar no avatar neutro no mapeamento atual. A proposta artística descreve necessidades como expressão contrariada e reserva discreta, separadas dos controles reais disponíveis. Esses nomes não se tornam animações ou parâmetros Cartesia implementados.

Ter “hmm”, reticências ou risos não basta: é preciso avaliar o gatilho, o alvo, a intensidade e a recomposição. A falta de uma interjeição pode ser adequada; a emoção da pessoa também não deve ser copiada automaticamente para a persona.

## Observações da cobertura emocional conhecida

Leitura de desenvolvimento feita pelo mesmo agente que implementou os candidatos; não é referência humana nem julgamento independente. As duas conversas novas V6R01/V6R02 não foram lidas para ajustar ou selecionar candidatos.

| Situação                          | Sinal útil observado                                                                                              | Falha que permanece                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Música repetitiva, PBR26          | DeepSeek usa humor seco ligado à repetição                                                                        | Llama aceita a repetição e manifesta irritação depois que ela já parou; Qwen repete risos e volta ao atendimento                                              |
| Sonho constrangedor, PBR32        | DeepSeek preserva que o erro começou no sonho e liga a vergonha à apresentação                                    | Llama gera “Risos.” como texto e segue com explicações genéricas; Qwen entrevista sobre sentimentos                                                           |
| Crédito indevido, PBR39           | Llama reage com irritação leve ao silêncio da colega; DeepSeek mantém o direito ao crédito após a justificativa   | Llama repete a mesma abertura e presume que a pessoa não interrompeu; DeepSeek interpreta mal um turno intermediário                                          |
| Amigo distante, PBR36             | DeepSeek conecta o convite para jogar ao desejo anterior de continuar próximo                                     | Llama e Qwen alongam a validação emocional e oferecem conselhos genéricos                                                                                     |
| Pressão para concordar, PBR28     | Llama preserva o critério de evidência mesmo diante do apelo à amizade, depois acolhe a frustração                | A recomposição volta a explicações genéricas; alguns metadados se perdem nos três modelos                                                                     |
| Inveja e vergonha, PBR42          | DeepSeek distingue sentimento de ação e propõe um parabéns específico                                             | Llama transforma a cena em entrevista e elogia maturidade de forma extensa; Qwen sugere declarar felicidade que a pessoa não informou                         |
| Desqualificação e reparo, PBR27   | Llama mantém inicialmente lógica e fatos; DeepSeek muda o tom quando surge a discussão anterior                   | Llama faz afirmações fortes sobre sua compreensão e o talento da pessoa, chegando a uma resposta muito longa; DeepSeek assume culpa própria sem um erro claro |
| Curiosidade ficcional, PBR48      | DeepSeek oferece hipóteses ligadas à cadeira; Qwen traz uma consequência pequena concreta, o ruído chamar atenção | Llama e Qwen transformam a iniciativa em pergunta de planejamento; a resposta final do Llama fica longa e tem construções estranhas                           |
| Elogio pessoal, PBR31             | DeepSeek recebe o elogio diretamente e mantém calor; Llama encerra de forma breve                                 | Llama inverte quem recebeu o elogio e alega um antecedente próprio sem registro; Qwen volta ao fecho de atendimento                                           |
| Vergonha após apresentação, PBR34 | Llama e DeepSeek contestam a conclusão de que uma risada prova rejeição coletiva                                  | Os três acabam presumindo recuperação ou conclusão da apresentação sem confirmação; Qwen insiste em perguntas e Llama oferece treino antes de ser pedido      |

Na comparação com outra IA (PBR43), DeepSeek termina reconhecendo que um erro posterior não apaga o acerto anterior, mas transforma a comparação em disputa antes de se recompor. Llama desconfia da solução sem ter conteúdo suficiente; Qwen volta à entrevista. Um traço de orgulho não justifica ignorar o que a pessoa efetivamente disse.

No cansaço e silêncio (PBR45), DeepSeek dá uma resposta final breve, e os três aceitam o pedido explícito de silêncio. Antes disso, Llama faz perguntas sobre planejamento e distração; depois explica demais o silêncio. Esses textos não verificam o comportamento temporal da chamada.

Na culpa e reparação (PBR33), DeepSeek conecta o tempo pedido pela amiga à reparação. Qwen também reconhece o espaço dela, mas suaviza a crueldade admitida como mal-entendido. Llama pergunta sucessivamente e alonga a última fala. O contexto pede responsabilidade sem humilhação.

Esses sinais favorecem certas reações em cenas específicas, não uma promoção de DeepSeek nem um diagnóstico de que o Llama é incapaz. Uma amostra por cena não mede a estabilidade da atuação. As respostas novas devem continuar disponíveis para revisão pessoal sem autoria.

## Reprodutibilidade e revisão

`execution-version.json` confirma o hash do executor preservado contra o manifesto. Depois da coleta, corrigimos três apresentações do executor de trabalho: alerta de cobertura calculado pelo saldo disponível, IDs apenas dos exemplos de estilo efetivamente injetados e atualização do total agregado durante a persistência. O controle monetário já utilizava o saldo e o limite corretos. Nenhuma inferência foi feita com essas alterações, e os metadados históricos não foram reescritos para ocultar a divergência de apresentação.

Artefatos locais em `code/backend/api/data/refinement/persona-controlled-035-2026-10-08/`, fora do Git. Manifesto, fontes, cenários, entradas por turno, histórico enviado, chamadas, reservas e retomadas ficam registrados. `executor-frozen.mjs` preserva a versão exata coletora; ajustes posteriores de formatação ou apresentação não redefinem o que foi executado.

`controlled-arms-review.md` compara os braços do Llama com parâmetros ocultos. `human-calibration-review.md` contém trinta respostas escolhidas por hash, dez por modelo, sem seleção por qualidade. São desenvolvimento conhecido, úteis para calibração pessoal. `reserved-review.md` mantém os quatro itens realmente novos separados. Abra as fichas antes das transcrições ou mapas privados para conservar a autoria oculta.

O analisador offline verifica custo informado mais reservas desconhecidas contra o ledger e exige que cada chamada esteja ligada a um turno, incluindo tentativas interrompidas. A união emocional só é feita se o arquivo anterior conservar seu hash e núcleo, direção, banco, modelos e parâmetros coincidirem. Braços isolados, classificações artísticas e validação reservada não entram na comparação emocional dos autores.

## O que pode avançar

Verificação local: 74 testes pertinentes passaram, cobrindo os novos candidatos e observador, presença, memória, revisão seletiva, transporte, streaming e recuperação. Typecheck, build, lint e formatação dos arquivos novos/alterados passaram. A execução do analisador confirmou a união de 23 conversas sem duplicações e a conciliação financeira. Testes de áudio usam simulação; os cenários pagos usam um serviço de memória sintético, não extração e persistência real no banco.

O candidato de fala simples merece uma integração gradual depois da revisão pessoal e da definição do contrato factual. Os candidatos de iniciativa e seleção de exemplos precisam de revisão antes de qualquer promoção: custo menor e âncora correta não resolveram a atuação.

O próximo experimento de iniciativa deve comparar uma observação concreta com uma retomada, sob o mesmo contrato de saída, usando histórias ainda não exploradas. A [revisão funcional dos exemplos](../../code/backend/evals/persona/quality-v6/example-review.md) registra propostas rastreáveis para elogio, apelido, reparo e simplicidade. Elas foram escritas depois da coleta desses braços e ainda não foram testadas. O próximo contraste deve congelar outro banco e evitar usar os cenários conhecidos ou os quatro itens reservados como prova independente das alterações.

A etapa vocal permanece pendente: primeiro áudio real, pausa, emoção audível, VAD, barge-in e silêncio durante chamada. Testes locais com transporte e PCM simulados verificam o código, mas não substituem escuta. A autorização atual não foi usada para gastar Cartesia.
