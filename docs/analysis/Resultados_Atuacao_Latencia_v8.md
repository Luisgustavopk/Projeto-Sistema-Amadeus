# Atuação, contrato ampliado e latência — Llama e DeepSeek, v8

Rodada textual concluída em 09/10/2026. **A separação de fala e expressão reduziu a espera e eliminou os erros de formato observados no classificador. Naturalidade, fidelidade e coerência emocional ainda não estão aprovadas.** Não houve síntese de voz, Cartesia ou alteração do seletor de modelos.

## Execução e orçamento

Foram concluídas 60 conversas, com **252 respostas comparáveis**, 42 por modelo/braço. Quatro cenários de desenvolvimento tiveram duas amostras; dois reservados, uma. As entradas em pt-BR são novas e não reproduzem as falas do banco de exemplos. Cada execução construiu seu próprio histórico. A ordem dos modelos e braços foi alternada; os cenários reservados não orientaram alterações de atuação nesta rodada.

Modelos: Llama 3.3 70B, rota `deepinfra/turbo`; DeepSeek V4.1 Flash, rota `deepinfra/fp8`, raciocínio desabilitado. As rotas, preço máximo e parâmetros foram conferidos no catálogo oficial antes das chamadas. Temperatura 0,6, saída máxima de 512 tokens e temporizador de segmentação de 700 ms foram mantidos entre braços. O observador usou DeepSeek, temperatura zero e JSON. Fontes: [catálogo do Llama](https://openrouter.ai/api/v1/models/meta-llama/llama-3.3-70b-instruct/endpoints) e [catálogo do DeepSeek](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints).

| Parcela                                                              |     Valor em US$ |
| -------------------------------------------------------------------- | ---------------: |
| Etapa anterior já consumida                                          |     0,1329291160 |
| Autores desta etapa, custo informado, incluindo tentativa descartada |     0,0544790720 |
| Observadores, custo informado                                        |     0,0036707552 |
| Jev: 95 decisões, custo informado                                    |     0,0214824540 |
| Duas chamadas interrompidas, reservas máximas conservadas            |     0,0019687200 |
| **Total agregado contabilizado**                                     | **0,2145301172** |
| **Saldo do teto de US$ 0,27**                                        | **0,0554698828** |

Uma falha `EPERM` na substituição local do arquivo do orçamento interrompeu uma tentativa parcial. As 36 conversas já concluídas foram preservadas; a tentativa parcial ficou em `discardedAttempts`, fora da comparação. Foram registrados 254 pedidos de autor e 86 de observador no total, incluindo os quatro pedidos dessa tentativa. Duas chamadas têm custo desconhecido; sua reserva permanece contabilizada, sem presumir gratuidade.

O gravador recebeu serialização e repetição limitada da substituição local do arquivo. A retomada preservou o manifesto de geração original, validou os demais hashes e registrou a revisão de orquestração separadamente. Não houve repetição automática de pedidos remotos. O resumo do Jev precisou de correção local para excluir fichas extras sem avaliação preenchida; as 95 respostas já recebidas foram reutilizadas, com zero novas chamadas.

## O que cada braço mede

| Braço    | Recuperação                        | Representação dos exemplos                    | Saída                                                            |
| -------- | ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| baseline | Diálogo e contexto anterior        | Turnos demonstrativos antes do histórico real | Cabeçalho de expressão + fala                                    |
| isolated | Descritores da função da interação | Bloco fictício separado do histórico real     | Cabeçalho de expressão + fala                                    |
| parallel | Igual ao isolated                  | Igual ao isolated                             | Somente fala; expressão classificada depois do primeiro segmento |

Baseline → isolated testa um **pacote**, porque muda consulta, passagens de busca e representação. Não permite atribuir o resultado somente à mudança de formato. Isolated → parallel mantém esses elementos e compara a separação dos metadados. O banco experimental é o v7, com até três exemplos; a recuperação da API usa o catálogo curado de 33 estilos e reranker configurável, portanto não é uma execução idêntica do Voice Test.

Os prompts finais, IDs e pontuações dos exemplos, históricos, texto bruto, uso de tokens e tempos estão nos artefatos locais. Não há fatos persistentes nesses seis cenários: a rodada avalia atuação e expressão, não aprova recuperação ou verificação de memória pessoal.

## Latência e formato

Tempos em segundos, **até o primeiro segmento textual utilizável**, incluindo a recuperação local do candidato. Não incluem STT, processo completo da chamada, TTS, transporte de áudio ou reprodução.

| Modelo / braço    | p50 primeiro texto | p95 primeiro texto | p50 geração completa | Metadados inválidos |
| ----------------- | -----------------: | -----------------: | -------------------: | ------------------: |
| Llama baseline    |               4,30 |               8,79 |                 4,93 |                4/42 |
| Llama isolated    |               3,95 |               8,49 |                 6,33 |               17/42 |
| Llama parallel    |           **2,13** |           **4,66** |                 4,54 |            **0/42** |
| DeepSeek baseline |               2,05 |               4,00 |                 2,23 |                7/42 |
| DeepSeek isolated |               2,07 |               5,17 |                 2,48 |               23/42 |
| DeepSeek parallel |           **1,71** |           **3,71** |                 2,10 |            **0/42** |

O ganho observado isolated → parallel foi aproximadamente 46% no p50 do Llama e 17% no DeepSeek. **Nenhum atingiu p50 ≤ 1,5 s** de primeiro texto utilizável. Isso impede declarar a latência vocal satisfatória.

Nas respostas com cabeçalho reconhecido, o intervalo mediano entre primeiro conteúdo bruto e primeira fala foi de 1,98 s no Llama isolated e 0,54 s no DeepSeek isolated. São subconjuntos de 25 e 19 respostas, respectivamente; não se deve subtrair medianas da tabela como se fossem o tempo de uma chamada específica. Todos os metadados inválidos desses braços decorreram da ausência da abertura `<expression>`, não de uma emoção nova rejeitada pelo contrato ampliado.

No parallel, o primeiro conteúdo bruto já era fala: p50 0,90 s no Llama e 1,00 s no DeepSeek. Ainda há espera por uma unidade falável: o intervalo mediano fala → segmento foi 0,90 e 0,71 s. Reduzir o temporizador é um candidato para outro teste isolado, preservando frases completas e medindo o impacto na voz; essa rodada **não** mudou o temporizador.

Os metadados paralelos chegaram, em mediana, **1,77 s depois do primeiro segmento no Llama e 1,59 s no DeepSeek**. Portanto, eles não podem controlar retrospectivamente o começo do áudio. Fazer o TTS esperar por eles anularia parte do ganho medido. A geração do texto foi entregue sem aguardar o observador; a avaliação aguardou seu resultado depois da geração, apenas para registrar a proposta.

As medições ocorreram numa máquina comum, com verificações locais de código durante parte da execução, sem isolamento de carga. São evidência de viabilidade do candidato nessa instalação, não benchmark de SLA do provedor nem estimativa garantida da chamada completa.

## Naturalidade: regressão que não deve ser escondida

| Modelo / braço    | Palavras p50 / p95 | Frases p50 | Perguntas por turno |
| ----------------- | -----------------: | ---------: | ------------------: |
| Llama baseline    |            17 / 32 |          2 |                0,43 |
| Llama isolated    |          29,5 / 67 |          3 |                1,07 |
| Llama parallel    |            30 / 54 |          3 |                1,07 |
| DeepSeek baseline |            13 / 22 |          2 |                0,38 |
| DeepSeek isolated |            21 / 59 |          3 |                0,52 |
| DeepSeek parallel |            22 / 46 |          3 |                0,62 |

O pacote de isolamento **aumentou comprimento e perguntas** nesta amostra. A separação de metadados trouxe velocidade e confiabilidade técnica, sem resolver essa regressão. Nenhuma célula atingiu a meta de ≤ 0,3 perguntas por turno. A contagem de frases é um diagnóstico de pontuação, afetado também por interjeições; a tabela não é uma nota automática de qualidade.

Não houve cópia literal de oito palavras dos exemplos nem repetição literal desse tamanho do próprio histórico, conforme o diagnóstico automático. Mesmo assim houve importação semântica de cenas e invenções. Ausência de cópia literal não comprova ausência de contaminação.

## Reações por situação — leitura editorial, ainda sem nota pessoal nova

| Situação                                                    | Ganho ou reação positiva observada                                                                                  | Falha que permanece                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N01: provocação → insistência → desculpa → retomada         | DeepSeek estabelece limite e aceita a desculpa; Llama rejeita o apelido em uma amostra                              | Em outra, Llama aceita o apelido e ri após a insistência. DeepSeek também admite parcialmente o apelido. Não há escalada consistente                         |
| N02: elogio → constrangimento → aceitação                   | DeepSeek distingue elogio à conclusão de elogio pessoal e encerra com reserva; Llama usa hesitação em alguns turnos | Llama volta a oferecer conversa. DeepSeek inventa olhar/corpo em uma amostra. Gratidão e constrangimento não garantem fidelidade                             |
| N03: surpresa e conquista → correção do alcance             | Ambos reconhecem a conquista sem negar a correção                                                                   | Llama presume trabalho anterior no desenho e pergunta por uma abertura. DeepSeek atribui busca de defeito a uma simples correção e também pressupõe abertura |
| N04: tristeza → contato retomado → alívio                   | DeepSeek acolhe a mudança sem impor plano no último turno da primeira amostra                                       | Llama prolonga com perguntas e presume trocas posteriores de mensagens                                                                                       |
| N05 reservado: dúvida causal → nova evidência               | Ambos atualizam a hipótese quando outra luz é mencionada                                                            | DeepSeek inventa circuitos diferentes e elimina hipóteses com certeza excessiva; Llama também se antecipa sobre a causa                                      |
| N06 reservado: vergonha da pessoa → desculpa aceita → humor | O riso aparece depois de a pessoa dizer que consegue rir, em vez de iniciar a cena com zombaria                     | DeepSeek presume que ninguém olhou depois e que silêncio da professora revela sua avaliação. Llama usa exasperação em um contexto de vulnerabilidade         |

Exemplos diagnósticos do caminho parallel, com o contexto preservado nas transcrições:

- **Recomposição específica:** DeepSeek, N01/1/4: “Tudo bem. Desculpa aceita.” O atrito deixa de dominar a fala. Isso é um ganho, embora a pergunta final continue prolongando o turno.
- **Constrangimento com função:** DeepSeek, N02/1/2: “Hã? Bom… isso é diferente de elogiar uma conclusão.” A hesitação marca a mudança do alvo do elogio. O último turno encerra com “Então está dito. E eu ouvi.”
- **Limite que desaparece:** Llama, N01/2/3 aceita a insistência como brincadeira e termina preparado “para o que vier”. O “Ai, sério…” na abertura não compensa a concessão no conteúdo.
- **Atendimento que retorna:** Llama, N02/1/4 encerra com “Se quiser conversar mais sobre alguma coisa, estou aqui.”
- **Cena importada/inventada:** DeepSeek baseline, N02/1/3 menciona continuar falando de “legenda”, ausente da conversa e presente no exemplo. No parallel, N02/2/3 ainda diz não saber onde olhar; a fronteira estrutural não eliminou vivência física inventada.
- **Antecedente inventado:** Llama parallel, N01/1/5 diz que estava pensando em como a pessoa conseguiria resolver o exercício, embora ele só apareça naquele turno.

Esses são achados editoriais do agente que implementou o experimento, **não aprovação humana nem juiz independente de cânone**. Duas amostras de desenvolvimento e uma dos reservados não estimam estabilidade em uso prolongado. Não foram alterados os prompts depois de ler esses resultados.

## Intenção, emoção e intensidade: eixos separados

O classificador produziu **84/84 objetos válidos** no contrato de 39 intenções, 50 emoções e intensidade 0–1. Isso demonstra compatibilidade do caminho técnico nesta amostra, não correção da atuação. Não houve erros do observador nas conversas comparáveis.

Persistem três problemas concretos:

1. Uma reprimenda do Llama em N01/1/3 foi rotulada `ponderar` / `constrangimento_leve`, enquanto o texto rejeita uma insistência. O contrato aceita irritação e limitar; a brecha está na classificação, não na enumeração.
2. As duas amostras de provocação do DeepSeek parallel continuaram rotuladas principalmente `ironia_leve`, mesmo ao estabelecer limite. O Llama também cede em parte das falas. É preciso avaliar texto e metadados separadamente: um rótulo de raiva não corrigiria uma fala permissiva.
3. **61/84 intensidades são exatamente 0,5**: 27 no Llama e 34 no DeepSeek. A faixa completa existe, mas a resolução efetivamente utilizada é pequena. Nenhum observador escolheu `raiva` ou `irritacao`; isso não exige forçar raiva em toda provocação, mas deixa a escalada sem validação convincente.

As etiquetas descrevem a reação da persona. Tristeza ou vergonha declaradas pela pessoa não obrigam a persona a receber a mesma emoção. Alívio com intensidade 0,5 depois da desculpa também não significa que a irritação permaneceu: trajetória precisa considerar qual emoção foi proposta, não apenas comparar números.

Os quatro presets vocais e três identificadores visuais continuam sendo os recursos executáveis existentes. `deliveryApplied=false` foi preservado. Nenhuma expressão nova foi sintetizada ou escutada.

## Jev: melhora mensurável, ainda sem autorização técnica para selecionar respostas

Foram avaliados 30 pares conhecidos com notas pessoais confirmadas, 26 extras sintéticos, oito controles editoriais novos, seis inversões A/B e 25 pares novos de Llama × DeepSeek no caminho parallel. O item `e429fbad8877` continuou fora da preferência, conforme decisão do usuário; duas outras preferências incertas também ficaram excluídas. Rubrica, entradas cegas e resultados foram preservados por hash. Identidade de modelo, gabarito e motivos pessoais ficaram fora do pedido ao juiz.

| Métrica nos 30 pares conhecidos          | Jev anterior |    Jev v8 |
| ---------------------------------------- | -----------: | --------: |
| Preferência pessoal                      |        18/27 |     19/27 |
| Adequação, notas pessoais definidas      |        33/42 |     32/42 |
| Aprovações falsas de adequação           |          9/9 |   **1/9** |
| Persona, notas pessoais definidas        |        24/42 | **33/42** |
| Aprovações falsas de persona             |         2/22 |      3/22 |
| Expressividade, notas pessoais definidas |        10/30 | **23/30** |
| Aprovações falsas de expressividade      |        11/25 |  **6/25** |

O avanço principal é deixar de aprovar automaticamente adequação. A mudança também elevou rejeições de respostas que a referência aprova: nove em adequação e seis em persona. Portanto, não foi uma melhora uniforme.

O juiz não usou `incerto` nos 30 pares conhecidos, mesmo onde a pessoa marcou incerteza: atribuiu sim ou não às 18 etiquetas incertas de adequação, às 18 de persona e às 30 de expressividade. Ainda há calibração insuficiente da abstenção. A concordância acima é no conjunto reutilizado para desenvolvimento da rubrica, não generalização nova.

Nos controles editoriais, acertou 7/8 preferências; conservou a escolha remapeada nas seis inversões. Os três controles de ambas inadequadas foram reconhecidos. Um dos três empates virou preferência por B, consistentemente nas duas ordens. Há três decisões internamente conflitantes nos extras, sinalizadas para revisão. Esses controles são hipóteses editoriais, não notas pessoais novas.

**Os 26 extras recebidos têm os campos de avaliação em branco**, tanto no arquivo original quanto na referência preservada. O gabarito separado declara intenção de projeto, não verdade humana. Por isso esses itens têm zero comparações de concordância pessoal; não foram preenchidos artificialmente nem misturados aos 30 pares avaliados.

Nos 25 pares novos, Jev preferiu DeepSeek 21 vezes e Llama quatro, sem empates ou “nenhuma”. Essa distribuição não autoriza promoção: na conclusão desta rodada, as notas pessoais novas ainda não existiam, e o juiz continuava cometendo falsas aprovações de expressividade. **Nenhuma seleção de resposta em produção foi ativada.**

Atualização de 9 de outubro: o usuário confirmou as fichas assistidas pelo Claude. A [revisão pessoal posterior](Revisao_Pessoal_Atuacao_v8.md) registra a correspondência dos arquivos, a concordância por item e as limitações dessa referência, sem alterar os resultados históricos.

## Artefatos para revisão

Todos os resultados individuais ficam em `code/backend/api/data/refinement/latency-v8-remainder/`, ignorado pelo Git:

- [Ficha cega completa: 42 itens, 252 respostas, todos os braços e amostras](../../code/backend/api/data/refinement/latency-v8-remainder/ficha-cega-completa.md).
- [Ficha separada de intenção, emoção e intensidade, com as mesmas letras](../../code/backend/api/data/refinement/latency-v8-remainder/ficha-expressoes.md).
- [Ficha menor: 25 pares novos para calibrar o Jev](../../code/backend/api/data/refinement/latency-v8-remainder/ficha-jev-pares-novos.md).
- [Transcrições identificadas para diagnóstico](../../code/backend/api/data/refinement/latency-v8-remainder/transcricoes-completas.md).
- `authors.json`, `jev.json`, `summary.json`, manifestos, entradas cegas, mapeamentos privados e orçamento durável.

Avalie primeiro o texto sem olhar modelo, metadados ou decisão do Jev. Depois use a ficha de expressão para julgar os três campos separadamente. Todas as respostas do roteiro estão representadas; nada foi reduzido a uma seleção de momentos positivos.

## Implantação e próximos ajustes

A recuperação da API recebeu a fronteira de cenas independentes e o índice por função, sem regras por palavras ou nomes. O índice desta instalação foi preparado: 79 documentos, 39 vetores elegíveis; os 40 trechos brutos de história continuam fora do prompt. Reinicie a API para recarregar o índice novo.

O caminho sem cabeçalho permanece **candidato de aplicação e avaliação**, sem substituir o processador do Voice Test. Ele recusa fatos persistentes, evitando ganhar tempo por retirar conferência de memória. A [arquitetura documentada](../architecture/Separacao_Fala_Expressao_v8.md) distingue as alterações implantadas desse candidato.

Os próximos passos fundamentados pelos resultados são: revisão pessoal das fichas; um braço isolado para recuperar concisão sem voltar a misturar cenas; avaliar a classificação de limite/irritação e a pouca variação de intensidade; depois comparar segmentação mais rápida sem cortes inadequados. A integração com memória deve preservar o contrato factual. Voz permanece para validação do usuário por último. Não é necessário ampliar orçamento para revisar os artefatos ou recalcular métricas.

Verificação local final: **627 testes em 93 arquivos**, lint, formatação, typecheck e build passaram. Os testes históricos continuam detectando alterações no gravador de orçamento e no roteador sem atualizar seus manifestos congelados. Os arquivos individuais de avaliação e o banco local permanecem ignorados pelo Git.
