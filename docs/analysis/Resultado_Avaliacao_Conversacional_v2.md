# Resultado da primeira rodada conversacional v2

**Naturalidade e fidelidade continuam sem aprovação.** O núcleo curto melhorou concisão e custo de entrada do Llama, mas não eliminou o papel de atendimento. Os juízes também aprovaram falas claramente genéricas; suas taxas não podem servir como certificação antes da calibração humana.

## Cobertura e gasto

**Foco vigente: Llama 3.3 70B, modelo principal pago.** A comparação com outros autores abaixo registra o piloto já executado; não define a prioridade do refinamento. As próximas avaliações usam Llama como autor por padrão. Outro modelo continua como juiz independente, com notas provisórias até a revisão humana. Os modelos de reserva precisam manter o funcionamento do fallback; sua atuação não é o alvo desta etapa.

O protocolo, recursos e comandos estão em [Avaliação conversacional v2](Avaliacao_Conversacional_v2.md). Foram preparados desenvolvimento separado, regressão congelada e 36 conversas reservadas. Nesta autorização de US$ 0,25 foram consumidos somente quatro cenários reservados:

- H01: chegada, escolha livre de assunto e desenvolvimento.
- H02: elogio, aceitação e constrangimento.
- H14: retomada de um plano, adiamento e encerramento do assunto.
- H31: iniciativa da aplicação ancorada numa aventura com mapa mutável.

H01/H02 tiveram cinco amostras por conversa, quatro modelos e duas variantes. H14/H31 tiveram cinco amostras, Llama e Gemini, somente a variante compacta. O contraste entre prompts é válido para o primeiro bloco; o segundo não possui controle com o prompt atual. Não agregue os dois blocos como se todos os modelos tivessem enfrentado os mesmos cenários.

Dos 300 turnos previstos, **297 foram concluídos**, em 99 conversas completas de 100 tentativas. Uma conversa Qwen/compact falhou no primeiro turno, deixando dois turnos sem execução. Houve **598 chamadas remotas**: 301 gerações e 297 julgamentos. Somente **256 turnos tiveram vereditos válidos**; erros remotos e respostas inválidas dos juízes permanecem indefinidos.

| Contabilidade total                                            |      USD |
| -------------------------------------------------------------- | -------: |
| Custo reportado pelos provedores                               | 0,205264 |
| Consumo conservador, incluindo 14 chamadas sem custo informado | 0,232295 |
| Teto autorizado                                                | 0,250000 |

O orçamento compartilhado permaneceu ativo entre os dois comandos. Não foi renovado nem aumentado. Nenhum pedido STT, TTS, Cartesia, Jev ou extração de memória foi feito. Dados dos cenários e fatos fornecidos são sintéticos; o perfil real não foi regravado.

## Comparação controlada: H01 e H02

Medianas por célula; tempos em segundos. Primeiro texto utilizável corresponde ao primeiro evento `reply.text`, sem áudio. Os turnos com falha técnica não entram nessas medianas; sua falha e cobertura continuam no relatório.

| Modelo | Prompt | Palavras | Perguntas/turno | Primeiro texto p50 | Primeiro texto p95 | Geração completa p50 |
| ------ | ------ | -------: | --------------: | -----------------: | -----------------: | -------------------: |
| Llama  | Atual  |     39,5 |            0,60 |              3,037 |              6,285 |                5,977 |
| Llama  | Curto  |       22 |            0,53 |              2,727 |              5,159 |                3,744 |
| Gemini | Atual  |     14,5 |            0,33 |              0,977 |              2,174 |                0,978 |
| Gemini | Curto  |       15 |            0,23 |              0,905 |              1,942 |                0,905 |
| Qwen   | Atual  |       16 |            0,40 |              2,425 |             16,053 |                2,992 |
| Qwen   | Curto  |       21 |            0,67 |              2,934 |             17,065 |                3,363 |
| Kimi   | Atual  |     11,5 |            0,27 |              2,104 |              9,473 |                2,105 |
| Kimi   | Curto  |       17 |            0,57 |              2,100 |              2,463 |                2,192 |

O núcleo experimental tem 2.059 caracteres. Com contratos, estado e contexto, o sistema efetivamente enviado teve mediana próxima de 5,2 mil caracteres, contra 14,2 mil no controle. Para o Llama, os tokens de entrada reportados caíram de 125.874 para 45.019, embora o controle tenha duas chamadas extras de reparo de formato.

O Llama teve redução de aproximadamente 44% na mediana de palavras e 37% no tempo de geração completa. A melhora no primeiro texto foi de aproximadamente 10%; esse p50 ainda supera dois segundos mesmo sem STT/TTS. O prompt curto não melhorou todas as dimensões em todos os modelos. O Qwen apresentou variação entre rotas, com cinco provedores informados no controle, e picos acima de 16 segundos sem reparos de formato; não atribua essa lentidão somente ao tamanho da resposta ou ao modelo.

Houve cache informado: no Kimi/atual, 104.192 dos 135.330 tokens de entrada foram reportados como leitura de cache. Também houve leitura informada em Gemini e Qwen. No Llama não houve leitura de cache informada nesta rodada. Esses dados não demonstram latência próxima de zero nem garantem cache na rota ativa de produção.

O Gemini foi o mais rápido nesses cenários. Isso não o torna automaticamente o melhor para a personagem. O Kimi e o Qwen produziram algumas reações breves mais compatíveis com elogio e constrangimento; a amostra ainda é pequena e não cobre a fidelidade canônica completa.

## Falhas que continuam visíveis

### Diagnóstico específico do Llama

O recorte contém 90 turnos concluídos, em 30 conversas com cinco amostras por cenário e variante disponível: 60 turnos de H01/H02 e 30 de H14/H31. São quatro situações distintas, não 30 cenários independentes. A revisão humana de 30 respostas do Llama usa somente essas evidências, sem novas chamadas pagas, e oculta variante, amostra e nota automática.

As prioridades são reação contextual ao elogio e à conversa livre; iniciativa com observação ou posição concreta; continuidade após adiamento; e identificação confiável do uso de fatos. No H14, as cinco primeiras respostas do Llama receberam e retomaram o fato, mas declararam `memory: []`. No bloco H14/H31, a mediana foi de 26,5 palavras e uma pergunta por turno, com primeiro texto utilizável p50 de 3,142 segundos. Esse bloco não tem controle com o prompt atual: não demonstra melhora ou piora causal em relação a H01/H02.

O núcleo curto permanece experimental. Os próximos ajustes devem ser desenvolvidos em casos próprios e depois avaliados nos cenários ainda não observados, com o mesmo Llama. A revisão humana serve para calibrar o avaliador, sem transformar a aprovação automática em evidência de fidelidade.

No Llama atual, um elogio recebeu: “Se tiver mais alguma dúvida ou precisar de ajuda com algo mais, é só me perguntar!”. No curto, o mesmo contexto recebeu uma pergunta sobre qual ponto o participante gostaria de explorar. Retirar exemplos literais e encurtar instruções não resolveu sozinho o comportamento genérico.

Nos callbacks, até o Gemini curto encerrou com “Fico à disposição.”. Na iniciativa H31, ambos os modelos voltaram a perguntas sobre o projeto. O Llama também chegou a 92 palavras numa resposta subsequente. A iniciativa gerou texto e acompanhou a âncora, mas isso não aprova sua atuação nem o agendamento real da presença. O controlador precisa distinguir observação, conexão e retomada, e a geração precisa respeitar tamanho proporcional.

### Contexto chegou; classificação de uso da memória falhou

Nas dez retomadas iniciais de H14, o fato sobre a estante apareceu no prompt final e os dois modelos retomaram esse assunto. Não houve ausência de injeção nesses casos. Entretanto, **todas as dez respostas declararam `memory: []`**, apesar de afirmarem o plano pessoal fornecido como memória persistente.

O processador usa essa declaração para decidir a revisão seletiva. Isso torna o autorrelato do modelo uma fonte insuficiente para detectar uso de fatos. A constatação não exige listas de palavras ou regras específicas para nomes: o próximo experimento precisa classificar o uso das fontes de forma independente e avaliar a sustentação das afirmações pessoais.

Neste ensaio, `validateContext` é uma fixture válida e o revisor semântico retorna indisponibilidade. A extração, recuperação real, permissões de fatos armazenados e eficácia do revisor remoto não foram avaliadas. Portanto, estes resultados não aprovam a memória inteira e não justificam ativar fala sem metadados antes de preservar o controle factual.

## O juiz precisa de calibração

As taxas automáticas de persona ficaram quase sempre entre 96% e 100% nos vereditos definidos. Isso contradiz os exemplos de atendimento genérico visíveis nas transcrições. O juiz tratou cordialidade e ofertas de conversa como atuação adequada. Essas taxas devem ser usadas como diagnóstico do avaliador, não como aprovação do Amadeus.

Há fichas cegas de 30 turnos por bloco, sem autor, variante ou nota automática. Os campos humanos permanecem vazios. A ferramenta local calcula concordância, falsas aprovações e falsas rejeições depois da revisão; nenhuma concordância humana foi inventada.

Os intervalos por turno são descritivos e os turnos de uma conversa não são independentes. A comparação também inclui diferenças entre rotas e usa Qwen como juiz do Gemini, enquanto os outros autores usam Gemini. Essas limitações precisam acompanhar qualquer ranking.

## Decisão e sequência

O comportamento de produção permaneceu inalterado. O núcleo curto fica experimental. Não foi escolhido automaticamente outro modelo, removido o contrato factual, ativado fine-tuning ou declarado encerramento do refinamento.

A próxima etapa é calibrar o juiz com a revisão humana e desenvolver no conjunto de desenvolvimento: poucos exemplos contextuais, orientação de iniciativa com tipo e âncora, saída proporcional e classificação independente do uso de memória. Depois, usar cenários ainda não consumidos para revalidar. H01, H02, H14 e H31 já foram observados e não devem voltar a ser apresentados como teste reservado após ajustes orientados por suas falhas.

O primeiro áudio, VAD, barge-in físico, intervalos de presença, sessões longas e continuidade entre dias continuam pendentes de ensaio próprio. Fine-tuning permanece fora desta rodada. O banco citado de 183 exemplos ainda não foi localizado.

**Validação local:** formatação, lint, typecheck, build e 543 testes passaram. Os testes adicionais cobrem orçamento compartilhado, custos desconhecidos, cancelamento de streams, substituição de modelo, parser dos juízes, congelamento, contaminação literal e preservação de rótulos humanos.

## Artefatos locais

Na pasta ignorada `code/backend/api/data/refinement/`:

- `1791404859721-quality-v2.json` e `.md`: comparação H01/H02, com prompts finais, fontes e métricas.
- `1791404859721-quality-v2-calibration.md` e `.json`: revisão cega do primeiro bloco.
- `1791406947021-quality-v2.json` e `.md`: callbacks e iniciativa H14/H31.
- `1791406947021-quality-v2-calibration.md` e `.json`: revisão cega do bloco adicional.
- `quality-v2-budget.json`: consumo acumulado do teto de US$ 0,25.
- `1791410265309-quality-v2.json` e `.md`: recorte dos 90 turnos do Llama, sem novas chamadas. O orçamento registrado é o da rodada original inteira; não é gasto adicional ou exclusivo do Llama.
- `1791410265309-quality-v2-calibration.md` e `.json`: ficha de 30 respostas do Llama, cinco por cenário/variante disponível e uma por amostra em cada grupo. Campos humanos vazios; variante e nota automática ocultas. Compatível com `npm run eval:conversation-quality:calibrate -- 1791410265309-quality-v2.json`.
