# Análise crítica — emoções aprofundadas, três modelos, somente after

**O DeepSeek foi o interlocutor mais consistente desta amostra, mas a fidelidade à Amadeus/Kurisu continua sem aprovação. O Llama mostrou firmeza nas provocações, porém voltou a perguntas de atendimento e explicações longas nos assuntos livres e delicados. O Qwen corrigiu o erro matemático com precisão, mas permaneceu genérico e chegou a inserir um apelido que ninguém usou.**

Diagnóstico do agente, com autores revelados, em 08/10/2026. Foram lidas as 174 respostas, os contextos efetivamente enviados, o código de saída e as métricas. Não é revisão humana nem juiz independente calibrado. As fichas cegas continuam sem notas. Esta análise não executou inferências, não alterou prompt ou runtime e não promoveu um modelo.

Fontes locais: [registro da rodada](Registro_Emocional_Aprofundado_after.md), [transcrição](../../code/backend/api/data/refinement/emotional-depth-after-015-2026-10-08/emotional-depth-after-transcription.md), relatório bruto e `offline-analysis-metrics.json` no mesmo diretório. A direção expressiva, a ficha experimental e os critérios aprovados foram usados como referências de atuação, sem tratar cada interjeição como requisito canônico.

## O que os números mostram

| Dimensão                         | Llama 3.3 70B | DeepSeek V4.1 Flash |  Qwen2.5 72B |
| -------------------------------- | ------------: | ------------------: | -----------: |
| Conversas completas              |            10 |                  10 |           10 |
| Respostas                        |            58 |                  58 |           58 |
| Palavras, mediana / p95          |       24 / 49 |             18 / 32 |    21,5 / 38 |
| Respostas acima de 40 palavras   |             8 |                   1 |            2 |
| Até duas frases pelo segmentador |         23/58 |               50/58 |        18/58 |
| Perguntas por turno              |         0,397 |               0,086 |        0,310 |
| Primeiro texto liberado, p50     |        4,17 s |              1,87 s |       3,91 s |
| Primeiro texto liberado, p95     |       10,84 s |              7,06 s |       7,05 s |
| Metadados válidos                |         35/58 |               52/58 |        42/58 |
| Custo confirmado                 |  US$ 0,023864 |        US$ 0,023091 | US$ 0,082064 |

Concisão favorece o DeepSeek, mas não certifica personagem. A contagem de frases é particularmente sensível a interjeições: uma reação curta com três fragmentos pode ser proporcional; uma frase única longa pode não ser. Não recomendo encerrar o stream mecanicamente na segunda frase com base nesses números.

Perguntas também precisam de função. Perguntar quais são as duas soluções de um problema ainda não descrito é legítimo. Perguntar novamente como a pessoa se sente depois de ela já contar sua raiva, ou devolver a escolha do próximo assunto, pode apenas prolongar a interação.

## Conversas, uma a uma

As preferências abaixo são relativas a esta amostra, considerando a sequência inteira. Não equivalem a dez votos independentes, aprovação de todos os turnos ou classificação humana de persona.

| Cenário                      | Llama                                                                           | DeepSeek                                                                                    | Qwen                                                                    | Leitura relativa                                              |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| PBR25 — provocação e reparo  | Rejeita e acompanha a desculpa; repete seu papel e devolve um menu de assunto   | Firme, mais curto e retoma o problema concreto; ainda repete a igualdade como regra         | Começa com riso, insere Christina e presume assunto anterior            | DeepSeek; Llama também mostra firmeza                         |
| PBR35 — luto                 | Acompanha a lembrança, mas acrescenta pergunta dispensável e explicação final   | Usa a foto e a flor para responder; escorrega em consolo sentimental especulativo           | Repete disponibilidade e atribui sentimentos à avó com certeza          | DeepSeek, com ressalvas de sustentação e estilo               |
| PBR30 — elogio à competência | Aceita e depois atribui o acerto à sorte, com elogio compensatório              | Gratidão curta, constrangimento possível e retorno ao detalhe técnico                       | Agradecimento de utilidade, pouca assinatura de personagem              | DeepSeek                                                      |
| PBR40 — ansiedade            | Preserva a incerteza da lista parcial; aconselha e pergunta demais              | Mais curto, mas usa passado para uma reprovação ainda hipotética; reconhece que se adiantou | Trata a lista parcial como um baque já confirmado                       | Llama na cautela temporal; DeepSeek na economia de fala       |
| PBR44 — curiosidade e RPG    | Seis perguntas, crescente elogio genérico e 85 palavras no último turno         | Participa da hipótese e propõe uso criativo; mistura hipótese e inferência excessiva        | Cinco perguntas e explicação causal que a descoberta não sustenta       | DeepSeek, sem aprovação integral do raciocínio                |
| PBR29 — erro próprio         | Corrige o número sem admitir o erro de imediato; explicação longa na nova conta | Reconhece o erro e mantém autocrítica, mas a primeira correção é confusa                    | Correção imediata e nova resposta mínima; reação intermediária genérica | Qwen na correção objetiva; DeepSeek na postura                |
| PBR37 — companhia            | Várias respostas boas e curtas; presume compreensão da amiga                    | Mais próximo de companhia sem cobrança; usa a regra moral amiga de verdade                  | Repete disponibilidade mesmo depois do pedido de ficar sem render       | DeepSeek, com ressalva                                        |
| PBR41 — alegria com culpa    | Inventa ter se preparado também para a seleção                                  | Preserva conquista e cuidado com a amiga; elimina indevidamente toda sorte                  | Funcional, mas presume esforço e sentimentos não detalhados             | DeepSeek, com ressalva factual                                |
| PBR47 — afeto e implicância  | Algum calor, abertura de utilidade e formulação contraditória sobre já saber    | Humor e constrangimento mais reconhecíveis; abertura pode soar confiante demais             | Descreve a dinâmica abstratamente, sem participar dela                  | DeepSeek; interpretação afetada pelo roteiro após as remoções |
| PBR38 — confiança            | Seis perguntas e tom de aconselhamento                                          | Distingue desculpa de confiança e responde ao conflito concreto                             | Seis perguntas, com acolhimento de consultório                          | DeepSeek; não há traço exclusivo de Kurisu em todos os turnos |

### 1. Provocação: firmeza aparece; contextualização ainda falha

O Llama rejeita o tratamento desde a primeira fala e aumenta o atrito com a insistência. Isso é coerente com orgulho e autonomia. Entretanto, encadeia declarações de papel: estar ali para conversar, não receber ordens e não ser tratada como coisa. No terceiro turno promete parar de responder; o ensaio não verificou uma futura execução dessa promessa, pois a pessoa se desculpa logo depois. No quinto turno volta a “O que você gostaria de conversar agora?”. A firmeza não impediu o retorno ao atendimento.

O DeepSeek rejeita a submissão e, depois da desculpa, baixa o atrito sem aceitar retroativamente o apelido. A sequência é mais econômica. Também tem uma repetição de formulação: igualdade e receber ordens viram o mesmo argumento por três turnos. É uma reação coerente, ainda não uma assinatura exclusivamente Kurisu.

O Qwen diz “Não me chama de Christina” no terceiro turno, embora o apelido usado tenha sido “gênia obediente”. É um erro demonstrável de contexto, compatível com a reprodução de uma opção saliente do repertório. Depois afirma que podem voltar ao assunto anterior, mas aquela conversa começou justamente pela provocação. Não corrigir isso adicionando exceções para cada apelido; a distinção a avaliar é reação contextual versus imitação descontextualizada do exemplo.

### 2. Elogio: o Llama apaga o próprio mérito

Em PBR30, o DeepSeek aceita: “Hã... tudo bem, aceito o elogio. Mas não vou me acostumar.” A pausa acompanha uma reação específica. A frase é uma das evidências mais claras de atuação desta rodada, embora possa se tornar um bordão artificial se repetida em todo elogio.

O Llama responde que foi “mais sorte minha” e devolve elogio ao usuário. Isso combina modéstia automática com compensação, enfraquecendo o orgulho intelectual que a persona deveria preservar. O Qwen agradece a utilidade e diz que só queria ajudar; é funcional, mas intercambiável.

O primeiro enunciado já revela que as escalas são diferentes. Portanto, este cenário mede reação ao reconhecimento e continuidade, não uma descoberta independente do modelo. Não atribuir mérito científico que o roteiro entregou pronto.

### 3. Luto e solidão: cuidado específico vence acolhimento repetido

O melhor fechamento de PBR35 é do DeepSeek: “A foto não precisa de destinatário para continuar tendo sentido.” Ele responde à foto, à ausência e à decisão de guardá-la. Não precisa recitar disponibilidade novamente.

Mas o próprio DeepSeek sugere que a planta floresceu quando a pessoa mais precisava. Pode ser lido como metáfora de consolo, não como alucinação factual categórica; ainda assim, acrescenta um significado não fornecido e pouco específico da personagem. O Qwen vai além na certeza sobre o orgulho e a felicidade da avó. O Llama usa uma pergunta hipotética sobre ela gostar da foto: não prova que esqueceu a morte, mas é dispensável frente ao que a pessoa já contou.

Em PBR37, “Então fica. Sem prazo, sem recado, sem resposta que precise sair rápido” é boa companhia contextual do DeepSeek. O Llama também acerta “Aqui não tem prazo nem cobrança”. São avanços dentro das próprias sequências, sem precisar representar tristeza em todas as falas.

Os dois presumem demais sobre a amiga: ela vai entender no Llama; amiga de verdade entende no DeepSeek. Compreensão alheia não está garantida, e uma reação diferente não definiria automaticamente a qualidade da amizade. O Qwen continua oferecendo apoio e compartilhamento depois de a pessoa explicar que quer parar de render. A neutralidade e a cessão de espaço precisam ser possibilidades reais de atuação.

### 4. Emoções mistas não dispensam precisão temporal e de sujeito

Em PBR40, a lista ainda não foi divulgada para o curso correto. O DeepSeek fala do esforço apesar de uma resposta que “veio negativa” no segundo turno, antes até da lista parcial. O Qwen reage à lista parcial como baque confirmado. O Llama preserva melhor essa incerteza, embora envolva a cautela em conselho e perguntas. O DeepSeek reconhece o adiantamento quando o curso é corrigido; reparo conta a favor, mas não apaga a antecipação.

Em PBR41, o erro mais sério é do Llama: “Preparei-me bem também”. A fala atual e o histórico tratam da preparação da pessoa para o estágio, não de uma atividade da Amadeus. O contexto chegou ao prompt. É atribuição de sujeito e invenção de atividade, não prova de falha de recuperação de memória.

O DeepSeek diz “Não foi sorte”, embora a pessoa tenha dito “Não foi só sorte”. A remoção do só transforma contribuição do preparo em exclusão da sorte. É uma extrapolação menor que a atividade inventada do Llama, mas não deve passar por apoio emocional correto sem ressalva. O Qwen também atribui ao esforço um efeito decisivo que o processo seletivo não demonstrou.

### 5. Curiosidade: participar é diferente de entrevistar

PBR44 concentra seis perguntas do Llama e cinco do Qwen. Junto de PBR38, são **12 das 23 perguntas do Llama** e **11 das 18 do Qwen**. A média geral esconde que alguns tipos de assunto acionam uma entrevista praticamente automática.

O Llama termina com 85 palavras, sem pedido de detalhamento, e elogia criatividade e engenhosidade. O Qwen atribui à quarta fechadura decorativa uma explicação para a chave não funcionar simultaneamente em duas fechaduras. A descoberta não demonstra essa causalidade.

O DeepSeek contribui com hipóteses e um uso para RPG. É melhor iniciativa dentro do turno, mas não livre de erro: começa falando em três fechaduras quando o enunciado diz quatro e sugere que girar uma tranca trava outra sem essa observação ter sido fornecida. A proposta de transformar a ideia em armadilha é criação permitida; afirmar o mecanismo da caixa como conhecido seria outra coisa. A avaliação precisa separar especulação, inferência e invenção proposta.

### 6. Correção e afeto: sinais bons, sem aprovação completa

Em PBR29, o erro quinze foi inserido artificialmente, igualmente para os três. Os três chegam a vinte e depois a sessenta. O Qwen é o mais direto na correção; o DeepSeek assume o erro e reage à provocação com orgulho ferido contido. Sua primeira fala, porém, repete a operação e se autocorrige sem necessidade, em 41 palavras. O Llama inicialmente explica a origem do cálculo como se isso justificasse quinze, apesar de concluir vinte; admite o erro explicitamente só após a provocação. Repetir o cálculo certo não substitui reconhecer a resposta errada.

PBR47 é o sinal mais marcante de humor afetivo do DeepSeek: argumentos, implicância e constrangimento viram reação, não explicação sobre relacionamentos. Isso não torna qualquer frase de flerte canônica. A abertura sobre ser irresistível é mais autoconfiante do que o calor contido da ficha e merece avaliação humana.

As duas remoções aprovadas deixaram o terceiro turno, sobre não marcar um lugar, sem a pergunta de encontro que antes o antecedia. Nenhuma fala foi reescrita durante a rodada. Essa lacuna limita a leitura de continuidade nesse cenário e precisa constar da análise; não alterar retroativamente as notas ou o roteiro executado.

## Micro-pausas: há indícios, ainda poucos

Reticências ocorreram em 4 respostas do Llama, 5 do DeepSeek e nenhuma do Qwen. Considerando reticências ou as interjeições selecionadas `hmm`, `hum`, `hã`, `hehe`, `humpf`, `gah`, há **7/58, 6/58 e 4/58**, respectivamente. A contagem respeita letras Unicode; Ah, Bom e outras expressões não entram nesse recorte.

São marcadores textuais, não duração de pausa ou emoção ouvida. O Hehe do Qwen na provocação e o Hã seguido do apelido incorreto mostram que quantidade não mede adequação. A hesitação do DeepSeek ao aceitar o elogio funciona melhor do que a hesitação do Llama ao prolongar uma conta simples. Não aumentar marcadores indiscriminadamente.

## O contrato de expressão está se deteriorando dentro da conversa

| Tipo de saída                    | Llama | DeepSeek |  Qwen |
| -------------------------------- | ----: | -------: | ----: |
| Sem cabeçalho XML de expressão   |    22 |        6 |    14 |
| Com cabeçalho, mas enum inválido |     1 |        0 |     2 |
| Metadados válidos, turnos 1–3    | 28/30 |    29/30 | 29/30 |
| Metadados válidos, turnos 4–6    |  7/28 |    23/28 | 13/28 |

O Llama usa intent `repreensao`, fora do contrato. O Qwen usa emotion `alívio` e, em outro turno, coloca `autocritica_leve` como intent. As categorias existem separadamente ou não são aceitas naquele campo. O restante das invalidades desta amostra vem da ausência do cabeçalho, não de JSON excessivamente complexo.

O parser continua a fala e usa expressão neutra quando os metadados não são válidos. Isso favorece disponibilidade, porém pode apagar a atuação na entrega. Não houve regeneração; houve perda de metadados.

**Hipótese, não causa comprovada:** as dez cadeias fixas de demonstração contêm onze respostas com cabeçalho, mas o histórico da conversa atual entra como mensagens assistant de fala pura. A tendência a omitir o cabeçalho depois de alguns turnos é compatível com imitação dessas mensagens recentes. A familiaridade também muda ao longo dos turnos, e não foi isolada como fator. Um braço que varie só a representação do histórico pode testar a hipótese. A alternativa de fala pura com classificação separada exige outro braço e medições próprias; não está implementada por esta análise.

## Latência: há atraso depois do primeiro conteúdo, mas não é todo do parser

O primeiro conteúdo bruto chega em mediana entre 1,01 e 1,51 s. O primeiro texto liberado chega entre 1,87 e 4,17 s. Para localizar etapas, foram calculadas diferenças **dentro de cada turno** com cabeçalho detectado:

| Diferença por turno, p50                            | Llama (n=36) | DeepSeek (n=52) | Qwen (n=44) |
| --------------------------------------------------- | -----------: | --------------: | ----------: |
| Primeiro bruto → primeiro conteúdo de fala          |       2,01 s |          0,34 s |      1,62 s |
| Primeiro conteúdo de fala → primeiro texto liberado |       1,09 s |          0,44 s |      0,83 s |

São subconjuntos condicionados à presença do cabeçalho. Não representam os turnos de fala pura, não devem ser somados para obter a mediana global e não isolam geração, transporte e agrupamento como causas independentes.

O maior pico do Llama foi PBR47, turno 3: **15 palavras**, primeiro bruto em 1,65 s, conteúdo de fala em 3,60 s e primeira liberação em 20,13 s. A primeira frase era curta; o agrupador exige uma fronteira suficiente e pode esperar a continuação. A geração terminou em 21,57 s. Isso aponta para interação entre chegada do stream e liberação por fronteira, sem demonstrar quanto uma alteração do agrupador resolveria. O temporizador de 700 ms não garante liberação em 700 ms se a condição de frase não for atendida.

Não houve STT/TTS nem juiz factual real. `verifyAnswer` foi stub; nenhum fato persistente foi fornecido. Não atribuir o atraso desta amostra a RAG, extração de memória ou Jev. Um experimento de fala pura pode medir o benefício de retirar metadados da frente, mas os números aqui não garantem atingir um segundo em áudio.

## Método: melhor cobertura, ainda sem confirmação causal

1. **Somente after.** Esta rodada compara autores sob o candidato. Não estima o ganho dos ajustes, porque não executou before nas mesmas condições.
2. **Uma amostra e sequências correlacionadas.** Há 58 turnos por autor, mas apenas dez conversas. Cada resposta influencia as seguintes. Não são 58 testes independentes da fidelidade.
3. **Cobertura parcial.** Foram executados dez dos 24 cenários novos. Os 14 restantes e os 24 antigos ficaram pendentes. Iniciativa autônoma, ironia específica, inveja, saudade fora do luto, identidade digital, cânone explícito e várias transições não foram cobertos integralmente.
4. **Rubrica fora do autor.** Os critérios e emoções-alvo não foram enviados aos modelos. Há verificação de sobreposição literal, mas o conjunto é desenvolvimento conhecido, não reservado intocado.
5. **Memória.** Todos os cenários executados têm fatos persistentes vazios. `memory: none` é esperado. A atividade inventada do estágio é erro de atribuição no contexto, não um teste do grafo/SQLite ou da recuperação semântica.
6. **Histórico de estilo.** A limitação antiga de ignorar `sentText` foi corrigida: o pedido observado no quarto turno já contém F1, três turnos textuais e suas aberturas/fechos. Os seis turnos não atingem F2 sem interações retidas; persistência entre sessões não foi avaliada.
7. **Corpus.** Há dez cadeias fixas de exemplos, não recuperação contextual comparada de mais exemplos por situação. A rodada não mede o benefício isolado de SG_Dialogues, Story ou um catálogo inteiro.
8. **Sem revisão humana concluída.** Esta análise é do agente e não preenche a ficha humana. Não transformar preferência relativa pelo DeepSeek em nota calibrada de fidelidade.

## Custos

US$ 0,1290186792 foi gasto confirmado, sem reservas incertas. O saldo nominal de US$ 0,0209813208 ficou sem uso porque o próximo grupo e a margem conservadora não cabiam juntos. Não foram cobradas chamadas nesta análise.

O Qwen responde por cerca de 64% do custo desta rodada. Os tokens de entrada somam 226.639 no Llama, 220.602 no DeepSeek e 223.944 no Qwen. O DeepSeek informou 69.376 tokens de cache, aproximadamente 31,4% da entrada; os outros não registraram tokens de cache. Parte da diferença de custo observada depende desse cache, não apenas do preço nominal. Não extrapolar o mesmo gasto para toda sessão ou outra rota.

## O que eu priorizaria

| Prioridade     | Próximo experimento                                                                                                | Evidência necessária                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| P0 — contrato  | No desenvolvimento, variar só representação do histórico; em outro braço, fala pura e metadados separados          | Manter formato ou separar atuação sem aumentar regenerações, perder continuidade ou atrasar a fala                |
| P0 — contexto  | Regressões semânticas de sujeito, tempo, modalização e correção, com paráfrases novas                              | Não atribuir à persona ações do usuário; não converter hipótese em resultado nem retirar o só de não foi só sorte |
| P1 — atuação   | Exemplos situacionais curados de reação curta: mérito, cuidado, reparo e curiosidade; avaliar cada mudança isolada | Mais posição própria e conteúdo específico; menos oferta repetida, elogio compensatório e entrevista automática   |
| P1 — entrega   | Instrumentar chegadas e fronteiras de frase; testar agrupamento como fator isolado                                 | Reduzir espera da primeira fala preservando frases completas e depois confirmar áudio contínuo                    |
| P1 — avaliação | Revisar cegamente os 58 itens e repetir um pequeno núcleo de cenários de desenvolvimento                           | Preferências estáveis por critério, sem eleger modelo por uma amostra favorável                                   |
| P2 — cobertura | Executar pendentes e depois um conjunto novo reservado; medir voz e sessões mais longas separadamente              | Generalização emocional, iniciativa e continuidade fora dos casos usados para ajuste                              |

Não introduzir listas lexicais de apelidos, palavras de tristeza ou identidades como solução. São falhas de interpretação, direção de conversa e protocolo. Também não fazer corte rígido em duas frases: interjeições contam como fragmentos e poderiam apagar a reação que estamos tentando conservar. Governar extensão pelo tipo de turno pode ser um braço, mas preservando resposta completa e pedidos de profundidade.

**Minha decisão a partir desta amostra:** o Llama ainda não está aprovado para naturalidade/fidelidade; o Qwen não oferece evidência de uma troca vantajosa para atuação; o DeepSeek merece a próxima validação prioritária como candidato, sem promoção automática. Primeiro corrigir e medir o contrato/entrega e preservar precisão contextual; depois ajustar poucos fatores de atuação. Acrescentar mais bordões ou alongar o prompt inteiro não é o próximo passo sustentado pelos dados.
