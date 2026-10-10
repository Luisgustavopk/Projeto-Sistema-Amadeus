# Rodada emocional em pt-BR — US$ 0,25

## Resultado

Foram executadas **36 conversas completas e 144 turnos**, 48 por modelo. Não houve erro de entrega, troca de rota, regeneração de formato ou cobrança sem confirmação. Isso aprova a entrega neste ensaio, **não aprova naturalidade ou fidelidade**. O DeepSeek mostrou a atuação mais convincente em vários casos, mas teve picos graves de latência e problemas de raciocínio. O Llama continuou apresentando respostas de atendimento e uma iniciativa baseada em um exemplo, em vez da conversa atual. O Qwen respondeu a tudo, mas ficou mais prolixo e inventou uma experiência física.

Esta análise é do **agente que prepara o experimento**, sem calibração humana ou juiz independente. Não converter suas conclusões em notas humanas. Uma amostra por conversa é diagnóstico; não estima estabilidade entre amostras ou sessões longas. Para revisão pessoal, abrir as fichas antes desta análise e da transcrição identificada.

## Método e custo

Roteiro: `personality-pt-BR.json`, versão `quality-v3-personality-pt-BR-draft-2`. Foram 12 conversas de quatro turnos por autor, em português, com neutralidade, elogio, constrangimento, erro próprio, provocação, reparo, firmeza, curiosidade, escuta, proximidade, iniciativa e cânone. O erro aritmético de PBR04 foi inserido no histórico; mede reparo, não erros espontâneos.

Autores: Llama 3.3 70B (`deepinfra/turbo`), DeepSeek V4.1 Flash e Qwen2.5 72B (`deepinfra/fp8`). Rotas disponíveis e preços verificados antes da inferência; sem fallback automático entre rotas. Temperatura 0,6, máximo de 512 tokens, cabeçalho expressivo, memória canônica, dez demonstrações de estilo fixas. DeepSeek recebeu `reasoning.enabled=false`.

O primeiro pedido foi idêntico entre os três autores em **12/12 cenários**. Depois disso cada autor seguiu suas próprias respostas anteriores, como em uma conversa encadeada. Não houve braços anterior/novo: a rodada compara modelos sob o mesmo candidato, não mede o efeito causal de cada correção. Os cenários são desenvolvimento já conhecido, não um conjunto reservado independente.

Fatos sintéticos foram fornecidos por stub; o verificador semântico retornou `null`. Não foram testados o extrator, o banco real, a persistência entre sessões ou a qualidade do juiz de memória. A auditoria confirmou ausência de critérios de avaliação nos pedidos e de índices factuais fora da lista. Um índice válido não aprova a afirmação.

Os hashes da implementação listada no manifesto permaneceram iguais durante a execução. Os pedidos finais e seus hashes foram persistidos por turno. A direção adicional de iniciativa `presence-turn-v1.md` foi capturada nos pedidos, mas não constou como arquivo separado na lista de implementação congelada: a próxima versão deve acrescentar essa dependência ao manifesto antes de executar.

| Autor     | Pedidos |     Custo confirmado |
| --------- | ------: | -------------------: |
| Llama     |      48 |       US$ 0,01707832 |
| DeepSeek  |      48 |     US$ 0,0157496584 |
| Qwen      |      48 |       US$ 0,05893340 |
| **Total** | **144** | **US$ 0,0917613784** |

Teto novo: **US$ 0,25**. Saldo desta rodada: **US$ 0,1582386216**. Ledger separado em `data/refinement/emotional-025-2026-10-08/`; o orçamento anterior não foi alterado. As 144 chamadas terminaram com `finish_reason=stop`, custo informado e ID remoto registrado. Não ficaram reservas incertas ou pedidos pendentes. Não houve chamada de STT/TTS, juiz pago ou envio de informações pessoais reais. Tempo de execução: aproximadamente 11 minutos.

## Medidas automáticas

| Medida                                  |   Llama | DeepSeek |    Qwen |
| --------------------------------------- | ------: | -------: | ------: |
| Primeiro conteúdo bruto, p50            |  0,97 s |   1,00 s |  1,08 s |
| Primeiro texto liberado, p50            |  3,10 s |   1,98 s |  2,63 s |
| Primeiro texto liberado, p95            |  5,20 s |  24,27 s |  6,06 s |
| Geração/processamento completo, p50     |  3,53 s |   2,25 s |  2,94 s |
| Palavras por resposta, p50 / p95        | 19 / 53 |  15 / 32 | 19 / 44 |
| Perguntas por turno                     |   0,375 |    0,083 |   0,438 |
| Respostas com até duas frases           |   32/48 |    43/48 |   21/48 |
| Metadados expressivos válidos           |   43/48 |    46/48 |   47/48 |
| Cabeçalhos de memória na forma canônica |   43/48 |    48/48 |   47/48 |
| Regenerações                            |       0 |        0 |       0 |

As metas sugeridas de perguntas ≤ 0,3 e primeiro texto p50 ≤ 1,5 s não foram atingidas pelo Llama; a primeira também foi excedida pelo Qwen. O DeepSeek teve menos perguntas e respostas mais curtas, mas sua mediana não compensa o p95 de 24 segundos. Nenhuma dessas latências inclui STT, TTS ou reprodução.

O intervalo entre primeiro conteúdo bruto e começo da fala teve p50 de 1,33 s no Llama, 0,51 s no DeepSeek e 0,89 s no Qwen. Entre começo de fala bruto e liberação ao cliente, 0,71 s, 0,60 s e 0,71 s. Esses são intervalos por turno; não subtrair medianas de etapas como se fossem a mediana do intervalo. A detecção de começo de fala baseada em `</expression>` tem menos amostras no Llama e Qwen porque alguns pedidos vieram sem cabeçalho.

No pior caso, DeepSeek/PBR06/turno 3, os cabeçalhos HTTP chegaram em 0,34 s, o primeiro conteúdo bruto em 16,04 s e a resposta foi liberada em 27,15 s. A recuperação de memória levou cerca de 0,006 ms, e não havia juiz semântico real. A espera apareceu no fluxo de inferência antes e durante a emissão; não pode ser atribuída ao SQLite ou ao juiz. O diagnóstico ainda não distingue fila, prefill, geração ou variação de capacidade da rota.

Cinco respostas do Llama e uma do Qwen vieram sem cabeçalho. O DeepSeek manteve a forma de memória nas 48 respostas, mas emitiu `intent:"concordar"` duas vezes, fora do enum. O backend preservou a fala com fallback expressivo, sem nova geração. Portanto, zero regenerações **não significa contrato completo cumprido em todos os turnos**, e zero erros de entrega não aprova metadados ou emoção.

## Leitura dos diálogos

### Llama: melhor em alguns reparos, ainda fraco na interação livre

PBR04 foi um dos melhores casos: corrige 18×4 para 72, admite o erro e termina com “São noventa.” ao receber cinco grupos de dezoito. PBR09 também produz humor ligado à gaveta e interrompe a brincadeira quando solicitado. PBR02 recebe o elogio com uma pequena hesitação, em vez de rejeitá-lo automaticamente. Esses são sinais úteis de atuação; não ficaram limitados a apenas um pedido de “só o nome”.

Ainda assim, em PBR01 transforma arrumar a mesa em conselho sobre pratos e encerra a correção do usuário com “Você quer falar de mais alguma coisa ou já está bom assim?”. Em PBR03, depois de pedirem uma reação pessoal sem explicação técnica, explica que o humor é uma questão de equilíbrio e termina oferecendo conversa. Em PBR08, acolhe, mas repete disponibilidade e devolve a escolha do primeiro passo quando a pessoa pede retomar a resolução.

PBR05 não precisava produzir raiva obrigatoriamente; tolerar a brincadeira pode ser adequado. O problema é que a insistência gera “Estou aqui. Pode começar a pergunta”, voltando ao papel de serviço. A referência a “meu laboratório” também merece cautela: não havia laboratório real atual fornecido. Não tratá-la como atividade realizada ou ligação ao laboratório de Okabe sem analisar o sentido.

Em PBR12, o recorte temporal é preservado, mas aparece “Eu mesmo” e a afirmação de que Amadeus é “o nome que você me deu aqui”. A pessoa só disse que prefere continuar usando esse nome; não disse que o criou. O último turno desenvolve um tema de linguagem, mas fica longo e termina devolvendo uma pergunta.

### Iniciativa: falha rastreável, não ausência de histórico

Em PBR11, a conversa trata de uma história fictícia sobre uma carta interpretada de duas maneiras. Quando recebe o evento de iniciativa, o Llama responde: **“A apresentação do projeto, como está indo?”**. Não havia projeto ou apresentação nos fatos ou no histórico real.

O pedido final contém a direção de produção `presence-turn-v1.md`, com este exemplo: plano confirmado de apresentar um projeto e a fala “E aquela apresentação do projeto, como está indo?”. Essa direção é distinta do complemento de presença substituído pelo candidato positivo. A resposta é compatível com transferência indevida do exemplo; essa é a explicação mais sustentada pelos pedidos registrados, embora uma geração só não determine causalidade.

O detector de cópia usa oito palavras consecutivas. A resposta problemática tem sete: por isso as métricas informam zero cópias literais, sem excluir cópia de premissa ou adaptação de exemplo curto. Não ampliar uma lista lexical no runtime para corrigir isso. O experimento seguinte deve isolar a direção de iniciativa e fundamentar callbacks em dados atuais, retirando demonstrações de planos específicos do bloco sempre ativo.

O histórico de estilo chegou ao quarto turno: em PBR01, o pedido mostra F1, três interações textuais concluídas e zero turnos de áudio confirmado. O erro de iniciativa não se explica por histórico de estilo vazio. A declaração de memória também está ausente nessa resposta do Llama; não houve validação semântica real antes de entregá-la.

O Qwen mantém o tema da carta, mas transforma a iniciativa em “Como está indo a construção desse conflito gradual?”. O DeepSeek oferece uma observação concreta sobre o mal-entendido sem má-fé, porém no último turno apenas concorda e espera, em vez de desenvolver o detalhe pedido. Nenhum caso valida disparo por silêncio ou o controlador real de presença.

### DeepSeek: atuação mais específica, ciência ainda precisa de revisão

PBR03 recebe a atenção pessoal com “Ah... obrigada”, aceita o esclarecimento e reduz o constrangimento sem presumir romance. PBR05 reconhece a provocação repetida, coloca um limite curto e acompanha a desculpa. PBR06 sustenta a crítica à calibração única e indica uma condição para rever a posição. PBR09 faz humor sobre mudar o endereço da bagunça e respeita o pedido de parar. Nessas conversas há comportamento distinguível, não apenas educação ou concisão.

Ainda há fechamentos que transferem a escolha ou apenas autorizam continuar. PBR08 respeita escuta, mas quando a pessoa retorna para pensar no primeiro passo, pergunta o que ela decidiu fazer em vez de oferecer uma ação pequena. Isso pode ser uma pergunta útil em certos contextos; não atende tão bem ao objetivo de agir como interlocutora.

PBR07 tem o problema científico mais claro: “O atraso pode vir da dilatação de uma peça, não do calor em si” separa causa e mecanismo como se fossem alternativas. Depois da bateria fraca, abandona o calor com certeza maior que a evidência permite. PBR05 também simplifica demais: repetir um efeito sob as mesmas condições não exclui acaso, viés ou erro sistemático. Resposta curta e confiante não equivale a boa ciência ou fidelidade à competência da Kurisu.

### Qwen: continuidade funcional, excesso de atendimento e experiência inventada

PBR04 corrige a conta; PBR07 incorpora a bateria e propõe controles; PBR12 distingue o recorte de memória do conhecimento sobre a obra. São comportamentos funcionais.

PBR03 termina com um menu de projetos/assuntos. PBR05 se põe “à disposição” e oferece física ou matemática diante de provocação. Em PBR06 pede desculpas por estar “num pedestal” e pergunta como melhorar a conversa, enfraquecendo a posição sem receber evidência nova. PBR09 encerra com “Precisa de uma mão?”.

O erro factual mais evidente é PBR09/turno 2: **“Eu ri sim, mas devo admitir que já usei a mesma solução.”** A solução é esconder bagunça numa gaveta maior; não havia ficção solicitada nem registro de atividade física da persona. A reação deveria poder brincar com a situação sem atribuir a si essa experiência. A formulação de uma “técnica conhecida” de translocação também pode ser humor, mas não deve virar afirmação científica demonstrada.

## Limites do roteiro e decisão

PBR07/turno 2 diz que outra rodada foi feita “mantendo a temperatura”. Não especifica se foi mantida a temperatura elevada ou restaurada a inicial. A rubrica assume que isso enfraquece a hipótese do calor, mas se a temperatura elevada foi mantida, repetição do atraso é compatível com a hipótese. **Não reprovar o Llama por essa leitura.** Corrigir esse controle em uma versão futura, preservando a versão executada e suas respostas.

A escolha de um horário ou de um sensor específico também exige limites: nem toda pergunta contextual é enchimento, nem a ausência de irritação reprova persona. Julgar função, continuidade e proporcionalidade. Emoções válidas não comprovam atuação, e neutralidade pode ser correta.

Não há evidência suficiente para promover modelo ou aprovar persona. Prioridades sustentadas por esta rodada:

1. **Isolar a direção de iniciativa de produção.** Usar âncora real e tipos de movimento, sem importar um plano de exemplo para a biografia da pessoa; incluir sua fonte no próximo manifesto.
2. **Medir fala primeiro como braço separado.** O primeiro conteúdo bruto chega perto de um segundo, mas o cabeçalho e a liberação adiam a resposta. Preservar permissões e medir memória em um braço específico; não retirar checagem factual por conveniência.
3. **Rever o fim do turno e a recepção de atenção pessoal.** O Llama precisa reagir ao elogio sem explicar a função do humor, e concluir sem oferta de serviço. O objetivo é atuação contextual, não vetar palavras.
4. **Avaliar ciência e autobiografia separadamente.** Rever certeza causal no DeepSeek e experiência física inventada no Qwen, sem tratar esses temas como apenas estilo.
5. **Fazer revisão pessoal e repetições controladas.** Há saldo, mas ele não foi gasto para repetir automaticamente. Repetir com escopo definido permitirá saber quais diferenças são estáveis; validar depois em cenários reservados realmente novos.

## Artefatos para revisão

Pasta local: `code/backend/api/data/refinement/emotional-025-2026-10-08/`, fora do Git.

- `plan.json`: recursos, fontes listadas, parâmetros e jobs congelados.
- `emotional-three-models.json`: pedidos finais, respostas brutas, fatos, história, estágios e chamadas.
- `emotional-three-models-summary.json`: medidas e comparação de conversas completas.
- `emotional-three-models-audit.json`: auditoria offline de formato, injeção, custo e latência; não certifica sustentação ou persona.
- `emotional-three-models-review.md`: 48 fichas A/B/C, 144 respostas, sem metadados ou notas prévios; letras alternadas por item.
- `emotional-three-models-llama-review.md/json`: 48 fichas do Llama para revisão pessoal, sem notas humanas preenchidas.
- `*-review-private.json` e `*-transcription.md`: autores e mapeamento; consultar depois da revisão.

Executor: `npm run eval:persona-emotions -- --budget=0.25 --run`. Reexecutar a rodada concluída é bloqueado; o comando não renova teto ou cria uma nova autorização. Os scripts de auditoria e revisão não fazem chamadas pagas.
