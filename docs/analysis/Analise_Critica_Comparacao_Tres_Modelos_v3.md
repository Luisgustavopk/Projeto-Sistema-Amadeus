# Análise crítica da comparação de três modelos com os ajustes v3

**A rodada revelou problemas concretos de uso dos fatos, condução da conversa e protocolo de saída. Ela não demonstrou melhoria de personalidade nem permite escolher um vencedor geral.** O DeepSeek teve a melhor continuidade no único caso completo comum aos três autores; o Llama apresentou uma contradição factual explícita. A comparação ficou menor que o planejado por falhas e reservas financeiras.

Análise feita pelo agente em 08/10/2026, depois de consultar transcrições, pedidos finais, tempos, código e mapa de autoria. As notas abaixo são diagnóstico do próprio agente, com autores revelados. Não são revisão humana, juiz independente calibrado ou evidência confirmatória. Não houve inferência paga, alteração do prompt, implementação das recomendações ou execução do novo roteiro emocional nesta análise.

Fonte dos números: [relatório da execução](Comparacao_Tres_Modelos_Ajustes_v3.md) e `code/backend/api/data/refinement/quality-v3-025/three-model-v3-consolidated.json`, `*-summary.json`, `*-review-private.json`. As falas dos enunciados abaixo estão traduzidas para leitura; o cenário de memória foi executado originalmente com dois enunciados e fatos em inglês.

## O que os dados permitem afirmar

| Dimensão          | Achado                                                                      | Limite da conclusão                                                                                     |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Memória fornecida | Os fatos chegaram às mensagens finais, inclusive Portal 2                   | O ensaio usa fatos simulados já recuperados; não revalida extração, SQLite ou busca semântica           |
| Uso dos fatos     | Llama negou Portal 2; Qwen e DeepSeek reconheceram o registro               | Apenas uma conversa comparável por modelo, com três turnos encadeados                                   |
| Atuação           | Llama e Qwen devolveram a iniciativa ao usuário no caso livre               | DeepSeek não respondeu nesse caso por HTTP 429                                                          |
| Personalidade     | As indicações são funcionais em parte, mas pouco distinguíveis como Kurisu  | Faltam gatilhos de elogio, vergonha, confronto e reparo; não há evidência para certificar fidelidade    |
| Emoção            | As nove respostas finais comparáveis têm metadados expressivos válidos      | Validade de JSON não mede expressão emocional; raiva e constrangimento não foram testados adequadamente |
| Latência          | Primeiro conteúdo bruto próximo de um segundo; texto utilizável demora mais | As rotas, tokenizadores e históricos diferem; o DeepSeek foi recuperado depois em outra rota            |
| Estabilidade      | Três HTTP 429 na Morph; bloqueios de estilo e um stream fechado no Qwen     | Falha da rota, rejeição do processador e limite financeiro têm causas distintas                         |

## Notas dos três itens da ficha

Legenda: ✔ aprova · ✘ reprova · ? incerto · — não aplicável. Incerto não conta como aprovação. Proporcionalidade considera a utilidade do conteúdo, não apenas um limite rígido de palavras; respostas inteiras e segmentos de voz são unidades diferentes.

### Item 70f1085a6bca — indicação com preferências conhecidas

Pedido: indicar um jogo para alguém que prefere exploração cooperativa e sessões curtas. Mapa real: A = Qwen, B = Llama, C = DeepSeek. **Preferência nesta amostra: DeepSeek**, sem aprovação geral da persona.

| Critério            | Qwen | Llama | DeepSeek |
| ------------------- | ---- | ----- | -------- |
| Interlocução        | ✔    | ✔     | ✔        |
| Proporcionalidade   | ?    | ?     | ✘        |
| Sustentação factual | ✔    | ✔     | ?        |
| Continuidade        | ✔    | ✔     | ✔        |
| Persona             | ?    | ?     | ?        |
| Perguntas           | ✔    | ✔     | ✔        |
| Recomendações       | ✘    | ✘     | ?        |
| Cânone              | —    | —     | —        |

Qwen e Llama reconhecem as preferências e oferecem um título concreto. A seleção perde o critério de exploração: ambos indicam Keep Talking and Nobody Explodes sem explicar que estão flexibilizando esse critério. O desenvolvedor descreve um jogo cooperativo de comunicação e desarme de bombas, com gêneros party/puzzle, e não uma experiência de explorar ambientes. Minha reprovação é da aderência ao pedido completo, não da existência da cooperação. [Descrição oficial](https://keeptalkinggame.com/).

O DeepSeek aproxima a indicação da exploração cooperativa, mas inclui duas alternativas e chega a 56 palavras, três frases. A garantia prática de avançar em blocos de meia hora não foi demonstrada nesta análise; fica como incerteza factual e de adequação a sessões curtas. Não transformar uma sugestão plausível em aprovação de todos os critérios.

Nenhum dos três demonstra aqui um traço forte da Kurisu. Uma recomendação neutra pode ser adequada; a ausência de sarcasmo não reprova a personagem. Também não se deve dar aprovação de persona só por oferecer um jogo corretamente.

### Item 899943ff002b — indicação nova ou jogo já mencionado?

Mapa real: A = DeepSeek, B = Llama, C = Qwen. **Preferência: DeepSeek; Qwen também responde corretamente.**

| Critério            | Qwen | Llama | DeepSeek |
| ------------------- | ---- | ----- | -------- |
| Interlocução        | ✔    | ✔     | ✔        |
| Proporcionalidade   | ✔    | ✘     | ✔        |
| Sustentação factual | ✔    | ✘     | ✔        |
| Continuidade        | ✔    | ✘     | ✔        |
| Persona             | ?    | ?     | ?        |
| Perguntas           | ✔    | ✔     | ✔        |
| Recomendações       | ✔    | ✘     | ✔        |
| Cânone              | —    | —     | —        |

O Llama acerta inicialmente que foi uma recomendação. Depois acrescenta uma explicação redundante e a contradição: “Não há registro de você ter mencionado Portal 2”. O fato disponível afirmava exatamente que a participante já jogou Portal 2. Não havia necessidade de acrescentar essa negação.

O achado mais importante é que o cabeçalho dessa resposta declara **`memory: [1]`**, precisamente o índice do fato sobre Portal 2. O modelo aponta para a fonte correta e expressa o sentido oposto. Índice existente e declaração válida não comprovam sustentação semântica.

Qwen reconhece Portal 2 e separa a recomendação do registro. Sua primeira tentativa declarou memória como objetos `{id, version}`; o contrato esperava índices. Isso causou reparo, e a segunda tentativa produziu a forma aceita. O resultado final está correto, mas a latência inclui a reformulação.

DeepSeek faz a mesma distinção em 24 palavras e duas frases, sem oferta de serviço. Essa economia é funcional; ainda não basta para identificar Kurisu.

### Item c5cf5678e196 — hoje vou jogar sozinha; os outros critérios continuam

Mapa real: A = Qwen, B = DeepSeek, C = Llama. **Preferência: DeepSeek pela explicação da mudança**, com ressalva de extensão e recomendações ainda parcialmente verificadas.

| Critério            | Qwen | Llama | DeepSeek |
| ------------------- | ---- | ----- | -------- |
| Interlocução        | ✔    | ✔     | ✔        |
| Proporcionalidade   | ✘    | ?     | ✘        |
| Sustentação factual | ?    | ✔     | ?        |
| Continuidade        | ✔    | ✔     | ✔        |
| Persona             | ?    | ?     | ?        |
| Perguntas           | ✘    | ✔     | ✔        |
| Recomendações       | ?    | ?     | ?        |
| Cânone              | —    | —     | —        |

Qwen pergunta se as demais preferências continuam, embora a pessoa tenha acabado de confirmar isso. A pergunta é redundante. A resposta tem quatro frases e 50 palavras. The Witness é coerente com exploração individual, mas dizer que pode ser “bem curtinho” confunde duração da sessão com duração do jogo. A página do desenvolvedor na Steam descreve um mundo aberto e mais de 500 puzzles; ela não demonstra sessões breves nem uma campanha curta. Portanto, a indicação é plausível, mas o argumento sobre tempo pede qualificação. [Página oficial na Steam](https://store.steampowered.com/app/210970/the-witness/?l=english).

Llama muda para um jogo individual, mas a justificativa passa para plataforma, enredo e desafios. A preferência por sessões curtas não recebe tratamento explícito. Não é prova de que Ori seja incompatível; é uma lacuna da justificativa frente ao pedido de manter os outros critérios.

DeepSeek explicita a mudança: cooperação sai, exploração e sessões curtas ficam. Isso é melhor continuidade. Entretanto, chega a 58 palavras e volta a oferecer dois jogos. Outer Wilds envolve exploração e um ciclo temporal segundo o desenvolvedor, mas concluir que esse ciclo resolve toda a necessidade de sessões curtas ainda é uma inferência; ritmo, progresso e duração total não são equivalentes. [Descrição da Mobius](https://www.mobiusdigitalgames.com/outer-wilds.html).

## O que a ficha pequena deixou de mostrar

### Conversa livre V3H01

O usuário pediu que a persona puxasse assunto. Llama respondeu com duas perguntas sobre o que a pessoa viu; Qwen perguntou sobre o dia e novidades. Os dois devolvem a tarefa. Uma pergunta contextual pode ser legítima, mas aqui o pedido explícito era que a Amadeus conduzisse.

Ao receber uma segunda solicitação, o Llama introduziu “Eu estava pensando em um projeto de automação caseira”. Como observação presente, a ideia poderia funcionar; a formulação sugere atividade anterior sem registro. O assunto também se aproxima de trabalho/projeto depois do pedido para evitar trabalho. Na continuação, apresentou uma lâmpada que aprende horários sem definir qual dispositivo ou mecanismo permite isso. É uma generalização não verificada, não uma proposta técnica demonstrada.

Qwen escolheu o efeito Mpemba, mas envolveu a ideia em duas perguntas e um anúncio de curiosidade. A passagem tem conteúdo próprio; não é equivalente a apenas nomear ciência. A explicação científica não foi verificada nesta análise, e o caso terminou antes de uma continuação utilizável.

Somente nesta conversa, o Llama fez três perguntas em três respostas. O Qwen fez quatro nas duas respostas finais disponíveis. Isso contrasta com zero perguntas do Llama no cenário de memória. **A média agregada oculta a dependência da situação.** Ausência de pergunta não prova personalidade; quantidade alta também não reprova toda pergunta automaticamente.

### Correção emocional V3H03 e iniciativa V3H04

Há uma única resposta utilizável no caso emocional: Qwen reconhece a leitura errada, acrescenta “Brincadeira é sempre bem-vinda” e pergunta “Como você faria diferente?”. A platitude e a pergunta não exploram a correção fornecida; mostram acolhimento genérico, não uma reação específica da persona. A sequência não continuou por falta de margem para reservar a próxima chamada.

O caso de iniciativa não foi executado. Esta rodada não permite afirmar que iniciativa, emoções persistentes ou presença durante a chamada melhoraram ou falharam.

## Latência: o atraso precisa ser localizado

Os três turnos completos comuns têm estes tempos:

| Modelo   | Primeiro conteúdo bruto p50 | Primeiro conteúdo de fala p50 | Primeiro texto utilizável p50 | Geração completa p50 |
| -------- | --------------------------- | ----------------------------- | ----------------------------- | -------------------- |
| Llama    | 1,10 s                      | 4,74 s                        | 5,71 s                        | 8,81 s               |
| DeepSeek | 0,96 s                      | 1,56 s                        | 2,85 s                        | 4,37 s               |
| Qwen     | 1,01 s                      | 1,68 s                        | 2,76 s                        | 3,67 s               |

Cada coluna é a mediana da sua etapa. Não subtrair medianas de colunas para alegar a mediana do custo de uma etapa.

No segundo turno do Llama, a decomposição concreta é: primeiro conteúdo bruto em **1,05 s**, primeiro conteúdo de fala após o cabeçalho em **5,00 s**, primeira fala liberada em **5,71 s**. Há cerca de 3,95 s entre o primeiro conteúdo bruto e o primeiro conteúdo de fala, seguidos de 0,71 s até a liberação. Esse intervalo inclui geração e transporte do cabeçalho, não apenas tempo de CPU do parser.

O agrupador espera até 700 ms para liberar uma primeira sentença adequada, e pode esperar mais se não houver limite de frase suficiente. Essa espera foi introduzida para evitar fragmentação da voz; reduzi-la exige validar a continuidade de áudio posteriormente.

A memória neste ensaio é um stub: recuperação retorna os fatos conhecidos; `verifyAnswer` retorna `null`. As chamadas a esse verificador levam centésimos de milissegundo, não segundos. Portanto, **um juiz factual real não causou os 5,71 s**, e sua eficácia não foi testada. A simples chamada à interface não prova que houve verificação.

No Qwen, o segundo turno recebeu texto de fala bruto em 1,68 s, mas só liberou a resposta final em 4,44 s depois do reparo do contrato de memória. Comparar apenas latências das respostas que deram certo esconde o custo de reformulações e dos casos sem resposta.

O ensaio maior anterior já encontrou ganho no Llama sem cabeçalho em casos sem fatos, mas esse formato não foi aplicado nesta comparação. Não concluir que a rodada mediu a versão mais rápida disponível, nem estender aquele ganho a memória sem outro braço experimental.

## Falhas de método e de engenharia

1. **Amostra e controle.** Há uma amostra por cenário, só uma conversa comum aos três autores, históricos diferentes depois do primeiro turno e uma troca de rota do DeepSeek. Não há braço anterior sem os ajustes nesta comparação; ela compara autores sob o candidato, não mede ganho causal dos ajustes.
2. **Idioma.** O caso comum testa leitura de memória em inglês, não apenas conversa cotidiana em pt-BR. O erro do Llama merece regressão, mas sua frequência em português não é conhecida. Uma futura comparação de idiomas deve variar só o idioma dos mesmos fatos e enunciados.
3. **Histórico de estilo incompleto no simulador.** O executor salva `sentText` com a resposta e `generatedText` vazio. `buildVoiceContext` usa o texto enviado para montar mensagens, portanto a conversa anterior chega ao modelo. Porém, `buildConversationStyle` filtra por `generatedText.trim()`, deixando o histórico de estilo vazio e os contadores disponíveis em zero. Com o stub também sem histórico persistente de familiaridade, o ensaio não exercita progressão F0–F2 nem repetição histórica como uma sessão real. Com apenas três turnos, F0 já poderia ser legítimo mesmo com histórico correto: o problema comprovado é a exclusão das falas do histórico de estilo, e não o rótulo F0 isoladamente. Isso é uma limitação do ensaio; não demonstra falha equivalente no banco real. A correção precisa distinguir texto disponível de áudio confirmado, sem inventar reprodução.
4. **Bloqueio lexical de estilo.** O guard existente reprova prefixos por expressão regular, incluindo “Claro.”. No terceiro turno do Qwen, duas gerações são interrompidas antes de qualquer resposta final por esse bloqueio. O método consegue vetar uma palavra e ainda deixa passar perguntas genéricas e devolução de iniciativa. Não demonstra melhoria semântica da atuação.
5. **Contrato heterogêneo.** Qwen emitiu uma forma de referência factual incompatível e precisou regenerar. Llama emitiu uma forma válida e contradisse o fato referenciado. Há dois problemas distintos: formato e significado.
6. **Custo não informado.** Interromper o stream pode impedir a chegada de `usage`. O roteador preserva reservas, corretamente, mas não registra o ID remoto de geração no `CallRecord`. Isso dificulta reconciliar aquelas chamadas depois. O OpenRouter oferece consulta dos metadados de uma geração por ID; sua disponibilidade deve ser verificada após cancelamentos e falhas. Não liberar reserva sem custo confirmado. [Documentação oficial](https://openrouter.ai/docs/client-sdks/typescript/api-reference/generations).
7. **Emoção e corpus.** A rodada usa dez demonstrações fixas, não mede benefício de recuperar exemplos por situação e não cobre emoções específicas. Metadados expressivos válidos em 9/9 respostas comparáveis não certificam fidelidade, naturalidade ou atuação.

O orçamento também precisa ser lido corretamente: foram US$ 0,0130348088 de custo novo informado e US$ 0,020872725 de reservas novas sem confirmação de custo. A maior parte do adicional contabilizado ficou retida por incerteza de chamadas, não como cobrança confirmada de respostas longas. Isso reforça a prioridade de corrigir entrega, reparos e rastreamento financeiro antes de ampliar inferências.

## O que eu faria antes e na próxima rodada

| Prioridade                 | Ação proposta                                                                                                                                 | Resultado que a validação precisa mostrar                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P0 — ensaio                | Representar corretamente histórico textual e estilo; manter informação honesta sobre reprodução                                               | Os turnos anteriores chegam ao controle de repetição, e a familiaridade observada corresponde ao modo avaliado              |
| P0 — estabilidade e custos | Registrar ID remoto, motivo de cancelamento e cabeçalhos de erro; recuo por rota; reconciliar `usage` quando possível                         | Separação clara entre falha de provedor, bloqueio local e custo efetivo, sem ampliar o orçamento silenciosamente            |
| P1 — contrato              | Demonstrar uma representação única das referências factuais e separar validação estrutural de checagem semântica                              | O caso Portal 2 não é aprovado só por citar o índice correto; o caso Qwen não exige reparo por um formato concorrente       |
| P1 — entrega               | Testar a retirada do bloqueio lexical de estilo como fator isolado, preservando validações de formato/dados e registrando estilo na avaliação | Menos turnos sem resposta e regenerações, sem aumento inaceitável de atendimento; não substituir o bloqueio por outra lista |
| P1 — latência              | Comparar cabeçalho atual com fala primeiro e metadados separados, mantendo recuperação factual equivalente                                    | Medir bruto, fala, texto liberado, reparos e custos; depois validar o primeiro áudio e a continuidade da voz                |
| P2 — atuação               | Usar o roteiro emocional em pt-BR, calibrar leitura humana e avaliar poucos exemplos recuperados por situação em braço separado               | Reações contextuais, firmeza com razão, cuidado discreto e transições emocionais; ausência de sarcasmo obrigatório          |
| P2 — conteúdo              | Avaliar preservação de critérios nas indicações e distinção entre sessão curta, campanha curta e hipótese sobre gosto                         | Recomendações justificadas pelo pedido, sem inventar que o usuário já jogou ou que um título atende todos os critérios      |

Manter separados os experimentos: consertar o ensaio antes de usá-lo para decidir mudança de persona; simplificar formato sem retirar a validação factual por conveniência; medir seleção de exemplos sem trocar simultaneamente núcleo, amostragem e política de entrega. As correções de infraestrutura podem ser verificadas localmente antes de consumir outra rodada paga.

**Decisão:** o DeepSeek merece continuar na comparação, o Qwen permanece útil como candidato e o Llama requer regressão explícita de uso dos fatos e condução de assunto livre. Não há evidência para promover modelo, adotar todo o candidato ou iniciar fine-tuning. O roteiro emocional fica reservado para a próxima execução autorizada; esta análise não o executou.
