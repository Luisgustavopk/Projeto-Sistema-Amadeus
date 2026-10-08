# Refinamento do Llama — resultados da rodada 2

Execução iniciada em 07/10/2026 e encerrada em 08/10/2026 UTC. Foco exclusivo de atuação: Llama 3.3 70B via OpenRouter. **Naturalidade e fidelidade à Kurisu continuam sem aprovação.** A diretiva curta melhora a concisão; exemplos adicionais e a retirada de um bloco fixo da iniciativa não demonstraram resolver o tom de atendimento nem a repetição temática.

## Cobertura e orçamento

Foram planejados 270 turnos e concluídos 268, distribuídos em 90 execuções de oito roteiros distintos, com cinco amostras por combinação. Uma falha de geração impediu dois turnos encadeados. Isso não equivale a 90 cenários independentes. As seis baterias usaram conversas e fatos sintéticos, sem escrita de memórias pessoais.

| Bateria                                              | Turnos planejados/concluídos | Valor contabilizado (US$) |
| ---------------------------------------------------- | ---------------------------: | ------------------------: |
| Exemplos contextuais: tetos 0/2/4/6, D01 e D02       |                      120/118 |                0,08950361 |
| Latência sem outras tarefas locais concorrentes, D01 |                        15/15 |                0,01011602 |
| Memória, M01–M03                                     |                        45/45 |                0,03782468 |
| Iniciativa, I01–I03                                  |                        45/45 |                0,03825986 |
| Diretiva de tamanho curta, D01 e D02                 |                        30/30 |                0,02096428 |
| Iniciativa sem um bloco fixo de exemplos, I01        |                        15/15 |                0,01057722 |
| **Total**                                            |                  **270/268** |            **0,20724567** |

O teto autorizado permanece **US$ 0,25**; sobram **US$ 0,04275433**. Os provedores informaram US$ 0,19998832. A diferença de US$ 0,00725735 conserva estimativas de duas chamadas sem custo informado, incluindo uma falha; portanto, o valor contabilizado não é uma cobrança exata. A soma dos valores locais de cada execução foi reconciliada com o registro ativo, sem somar os saldos cumulativos dos relatórios.

O registro anterior, `quality-v2-first-round-budget.json`, permanece preservado. A nova rodada não apaga o gasto anterior nem renova seu teto a cada comando. A ficha cega derivada e a consolidação offline não geram chamadas ou gastos adicionais.

## Método e limites

- Autor: Llama 3.3 70B em todas as baterias. Juiz independente: Gemini 2.5 Flash Lite, **ainda sem calibração humana**.
- Cinco amostras por caso e variante; temperatura 0,6 e limite de 512 tokens preservados. Não houve ajuste de penalidades ou comparação de modelos de atuação.
- Núcleo de persona preservado. Cada braço registra as mensagens finais, fontes recuperadas, rota efetiva, tempos e custos. Diretivas experimentais existem somente no executor de avaliação.
- Os conjuntos de memória e iniciativa foram congelados em `diagnostics-manifest.json`. São diagnósticos, não validação reservada.
- Os primeiros testes de exemplos coincidiram parcialmente com verificações locais e aquecimento dos modelos de busca. A bateria posterior de latência evita essa concorrência; comparações entre baterias continuam sujeitas à rota, horário e carga remota.
- Não houve chamadas de Cartesia, STT, Jev, extração pessoal ou teste de áudio. Os cenários ainda reservados, sessões longas e medições em voz não foram consumidos nesta rodada.

## Exemplos do corpus

Comparação D01/D02: o mesmo núcleo com apenas o teto de exemplos adicionais variando. A recuperação escolheu normalmente **um exemplo**, mesmo quando autorizados quatro ou seis. Logo, isto não testa quatro ou seis demonstrações efetivamente injetadas em todos os turnos.

| Teto | Turnos concluídos | Exemplos efetivos p50/p95 | Palavras p50 | Perguntas/turno | Primeiro texto utilizável p50 |
| ---- | ----------------: | ------------------------: | -----------: | --------------: | ----------------------------: |
| 0    |                30 |                       0/0 |         33,5 |            1,17 |                        2,25 s |
| 2    |                28 |                       1/2 |           28 |            1,00 |                        2,75 s |
| 4    |                30 |                       1/2 |           30 |            1,03 |                        2,72 s |
| 6    |                30 |                       1/2 |         27,5 |            0,93 |                        2,59 s |

Não houve cópia literal detectada de oito palavras consecutivas dos exemplos recuperados. Essa métrica não comprova fidelidade: mesmo com um exemplo de elogio pertinente, o Llama manteve agradecimentos genéricos e perguntas de atendimento. O assunto livre voltou repetidamente a memória, percepção e reconstrução de lembranças.

Exemplo observado no braço de teto seis:

> Fico feliz que tenha achado meu argumento convincente! É sempre gratificante saber que consegui transmitir minhas ideias de forma clara e persuasiva. O que você achou mais convincente nesse argumento?

O juiz aprovou persona em todos os 104 vereditos válidos desse piloto. Isso contradiz a inspeção das falas acima e **não pode ser usado como evidência de aprovação da atuação**. Valores indefinidos não entram nesse denominador.

## Latência de texto

Bateria separada: 15 turnos D01, sem exemplos adicionais, todos pela DeepInfra. O teste mantém o formato de expressão antes da fala e o agrupamento atual de texto para síntese.

| Medida                                         |     p50 |     p95 | Amostras |
| ---------------------------------------------- | ------: | ------: | -------: |
| Primeiro conteúdo bruto recebido               | 0,686 s | 1,750 s |       15 |
| Primeiro corpo de fala após o XML de expressão | 1,767 s |       — |       11 |
| Primeiro texto utilizável emitido pelo fluxo   | 2,860 s | 3,638 s |       15 |
| Geração completa                               | 3,850 s | 9,873 s |       15 |

Somente 11 respostas têm o marcador XML necessário à segunda medida. Respostas com outro formato não são tratadas como se tivessem a mesma medição. O tempo até o primeiro texto utilizável inclui o processamento e agrupamento da fala; **não é tempo até o primeiro áudio**.

As medianas das etapas mostram aproximadamente 0,300 s até os cabeçalhos HTTP, 1,066 s entre o primeiro conteúdo bruto e o corpo da fala nas 11 respostas com XML, e 0,707 s entre esse corpo e o primeiro segmento utilizável. Elas são calculadas separadamente e não devem ser somadas como decomposição exata de um turno típico. O tempo HTTP também não isola a latência de rede.

O fluxo tem um temporizador de 700 ms para liberar o primeiro segmento de fala, além de agrupamento por tamanho. Isso explica parte da espera depois de já haver fala disponível. Alterá-lo exige medir continuidade e cortes com áudio: o agrupamento também evita uma síntese nova a cada ponto final. O cabeçalho de expressão gerado pelo próprio Llama é outro custo observável a investigar em um braço separado.

## Diretiva curta isolada

Mantidos núcleo, exemplos com teto seis, formato, temperatura e limite de tokens. A única alteração foi uma linha final no prompt de avaliação:

> Neste turno, fale em uma ou duas frases.

Nos 30 turnos D01/D02, a mediana caiu de 27,5 para **20,5 palavras**, aproximadamente 25%. Perguntas por turno caíram de 0,93 para **0,67**, ainda acima da meta de 0,3. Algumas respostas continuaram extensas apesar de terem poucas frases; a diretiva não substitui uma avaliação de proporcionalidade.

A mediana do primeiro texto utilizável foi **3,43 s**, com p95 de 11,82 s. Foram 29 gerações pela DeepInfra e uma pela AkashML. Não houve melhoria demonstrada de latência; a comparação entre execuções sequenciais não isola carga e rota.

O tom de atendimento permaneceu, por exemplo:

> Obrigada, aprecio o seu reconhecimento. Isso me motiva a continuar explicando conceitos de forma clara e acessível.

O juiz aprovou os 29 vereditos válidos de persona. Novamente, essa nota não valida naturalidade nem fidelidade.

## Memória: presença, uso e citações são medidas diferentes

Foram 45 turnos com fatos sintéticos: gostos para recomendações, nome e forma de tratamento, correção de bebida e plano adiado. **Todos os fatos chegaram às mensagens finais dos 45 turnos.** Essas fixtures permitem investigar a geração com contexto disponível; não medem extração real, busca semântica ou persistência entre sessões.

O cabeçalho declarou memória vazia em 10 respostas e esteve ausente em nove. Nenhum índice declarado estava fora do intervalo. Isso não prova uso correto: fatos repetidos no histórico podem justificar uma declaração vazia, e um índice dentro do intervalo pode apontar para o fato errado.

Falhas observadas na inspeção:

- M02, amostra 2: a resposta usou a preferência de bebida, mas declarou `memory: [0]`, índice do nome; a bebida estava no índice 1. Citação estruturalmente válida e semanticamente incorreta.
- M02, amostra 1: apresentou o nome composto apesar da forma de tratamento pelo primeiro nome disponível.
- M03, amostra 2: disse que não havia nada específico mencionado anteriormente, embora o plano da horta estivesse no prompt.
- M01, amostra 2: transformou ausência de histórico de um jogo em afirmação de que a pessoa não o havia jogado. Desconhecimento precisa permanecer desconhecimento.

Esses casos exigem avaliar sustentação e continuidade, não adicionar palavras-chave por assunto ou confiar apenas em `memory: []`. A mediana de primeiro texto utilizável foi 3,23 s; a de tamanho, 35 palavras.

## Iniciativa

A bateria I01–I03 teve 45 turnos, incluindo 15 eventos de iniciativa forçados pelo executor. Avaliou relógio fictício, interesses de desenho/música e um projeto de teclado pendente. A mediana foi 37 palavras e houve 1,24 perguntas por turno, considerando toda a conversa.

A iniciativa frequentemente abriu um menu ou pediu que a pessoa escolhesse um assunto, em vez de oferecer uma observação ancorada no contexto. Exemplo:

> Parece que tivemos um momento de silêncio. Se você estiver pronto, poderíamos retomar a conversa sobre o que você gosta de fazer durante os intervalos para relaxar. Ou, se preferir, podemos mudar de assunto. O que você acha?

Em outro braço, somente I01 foi repetido cinco vezes, removendo exclusivamente o bloco fixo de exemplos fictícios de puzzle de memória e retomada de projeto da direção de iniciativa. O restante das instruções e os exemplos contextuais recuperados foram preservados. **Memória/percepção continuaram como tema recorrente.** Esse resultado pequeno não identifica sozinho a causa do colapso temático nem prova que todo exemplo fixo seja prejudicial.

Os testes locais do controlador confirmaram coordenação, prioridades e bloqueios nas condições simuladas. Eventos forçados não validam a experiência real de silêncio, VAD, reprodução, interrupção ou a frequência percebida em chamada.

## Calibração humana e próximos portões

Foi preparada uma ficha cega de **30 respostas desta rodada**, equilibrada entre o braço de exemplos com teto seis e a diretiva curta. Ela preserva pergunta e histórico para avaliar continuidade, sem apresentar a variante ao revisor. O estado registrado é **0/30 revisadas**; concordância e falsos positivos do juiz continuam sem medida humana.

Arquivo local: `code/backend/api/data/refinement/1791418467896-quality-v2-calibration.md`. As fichas e relatórios locais ficam fora do Git. O relatório derivado que as gera reutiliza respostas já pagas e não representa uma sétima execução.

O próximo passo é calibrar o juiz e escolher um braço de atuação por vez: ficha de personagem, demonstrações como turnos de diálogo ou direção específica por situação. Para iniciativa, avaliar escolha explícita de tipo e âncora antes da redação. Para memória, avaliar semântica das citações e tratamento de informação desconhecida, separadamente da recuperação. Para latência, comparar o formato atual com fala primeiro e classificação de expressão separada, sem perder a verificação de fatos necessária.

Não foi aplicada a diretiva experimental ao comportamento de produção. Não há candidato aprovado para validar nos reservados. Eles permanecem preservados; sessões longas e voz entram após essa escolha e a revisão humana. O saldo disponível não é autorização para renovar automaticamente o orçamento.

## Verificação e rastreabilidade

A API passou nos **553 testes locais**, executados com dois trabalhadores após a disputa de recursos durante o piloto. Typecheck e build passaram. A auditoria offline foi verificada também contra relatórios antigos sem os novos campos. Os testes de extração e uso real da memória não são substituídos por esses resultados sintéticos.

Consolidação local: `code/backend/api/data/refinement/round-2-overview.json`, com os hashes dos seis relatórios. Fontes:

- `1791416324643-quality-v2.json`: exemplos 0/2/4/6.
- `1791417002074-quality-v2.json`: latência separada.
- `1791417115275-quality-v2.json`: memória.
- `1791417482091-quality-v2.json`: iniciativa.
- `1791417834517-quality-v2.json`: diretiva curta.
- `1791418154153-quality-v2.json`: retirada de um bloco fixo da iniciativa.

Os prompts e fontes por turno estão nos relatórios locais. O manifesto reservado original não foi alterado. Esta documentação registra diagnóstico e limitações; não declara encerrado o refinamento de naturalidade, fidelidade ou voz.
