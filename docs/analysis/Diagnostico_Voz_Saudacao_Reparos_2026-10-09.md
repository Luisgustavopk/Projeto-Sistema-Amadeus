# Diagnóstico da conversa real — 09/10/2026

O proprietário testou Llama com liberação inicial de 700 ms e DeepSeek com 200 ms. Relatou saudações de atendimento, uso de nome completo, aceitação do apelido como “Cristina” e reparação repetida. As capturas mostram medianas de 8,44 s e 4,84 s até o áudio agendado, com 9 e 5 amostras. Modelo e temporizador variaram juntos: isso não constitui uma comparação isolada de modelos ou segmentação.

## Medição consultada

Consulta local autenticada a `GET /v1/metrics`, sem chamada de provedor. A fotografia é acumulada na instância, com 63 turnos, 41 concluídos e 22 interrompidos. Não separa os dois testes nem suas configurações.

| Etapa registrada                               | Amostras |      p50 |       p95 |
| ---------------------------------------------- | -------: | -------: | --------: |
| STT                                            |       68 |   848 ms |  3.396 ms |
| Recuperação de memória                         |       63 |   334 ms |    994 ms |
| Referências da persona                         |       63 |   216 ms |    318 ms |
| Primeiro token da LLM                          |       50 | 1.336 ms |  3.642 ms |
| Primeiro segmento falável                      |       45 | 2.365 ms |  5.392 ms |
| Revisão de memória                             |       29 |   496 ms |  1.079 ms |
| TTS, duração da operação                       |       69 | 1.780 ms |  4.222 ms |
| Primeiro áudio após recebimento da fala na API |       44 | 5.627 ms | 13.507 ms |

Os percentis não devem ser somados: as populações e pontos de partida diferem, e há etapas concorrentes. A duração total do TTS não é sua latência até o primeiro quadro. A estimativa do navegador inclui a pausa final do VAD e agendamento, sem confirmar som físico. O temporizador de 200/700 ms começa no texto disponível e requer um limite de frase válido; não garante áudio nesse intervalo.

Foram registrados dez esclarecimentos, uma regeneração após revisão de memória, três aberturas repetidas e vinte expirações do observador de expressão. Não houve reparos de formato nesta fotografia. O classificador de expressão permanece paralelo à fala; suas expirações não comprovam bloqueio do áudio.

## Correções aplicadas

- Direções em Markdown passam a distinguir nome completo armazenado de primeiro nome ou tratamento explícito usado na conversa. Não há alteração dos fatos no SQLite nem lista de nomes no código.
- Saudação espontânea e saudação comum recebem uma abertura breve que termina no encontro. Fidelidade à persona segue pendente de validação conversacional.
- Apelidos provocativos e aproximações de transcrição são interpretados pela função no diálogo. “Cristina” não é um nome preferido; insistência permite irritação crescente, enquanto engano e desculpa pedem correção discreta e recomposição.
- Reparos usam quatro falas autorais em `input-repair-v1.md`, variando por chamada. Isso resolve repetição literal, não a qualidade do reconhecimento de fala.
- Somente uma decisão `clarify` suficientemente confiante substitui a fala. `clear` de confiança baixa e `uncertain` não são evidência de incompreensão. A revisão factual de memória permanece independente.
- Se a necessidade de reparo já é conhecida antes da geração, a API dispensa a geração principal que seria descartada. A análise opcional não introduz espera adicional. Uma decisão que chega antes do primeiro segmento ainda pode interromper uma interpretação indevida.
- Reparos passam a ter a etapa `inputRepair`, em vez de contaminar `llmFirstSpeechSegment`. A etapa nova `ttsFirstAudio` distingue o primeiro áudio recebido do TTS da conclusão da operação.

## Validação seguinte

Testes locais verificam abstenção, reparo sem chamada ao autor, variação entre reparos, cancelamento e proteção de memória. Não demonstram naturalidade nem ganho real de voz. Não foram executadas chamadas pagas ou Cartesia nesta correção.

Repetir uma conversa curta por modelo com o mesmo temporizador de 200 ms, mantendo rota e demais opções. Separar saudações, apelido acidental, provocação repetida, desculpa e tratamento pelo primeiro nome. Exportar o JSON de cada chamada e registrar os tempos da API antes/depois; os agregados da instância podem misturar sessões. Investigar picos por etapa antes de alterar provedores, revisão factual ou segmentação.

## Retorno seguinte: pouca intensidade

A nova transcrição mostra rejeição do apelido, mas também cobrança formal, nome completo persistente, atividade inventada (“ocupada com uma análise”) e interpretação literal de uma metáfora dirigida à persona. Rejeitar um apelido não aprova fidelidade nem expressividade. As direções foram revistas para privilegiar réplica curta, cadência, recomposição contextual, primeiro nome e ausência de atividade não registrada. Dez testes locais de montagem, orçamento de prompt e direção passaram; não houve nova avaliação paga ou audição pelo agente.

A intensidade do contrato continua entre 0 e 1, mas o adaptador Cartesia não recebe emoção ou intensidade: envia texto, voz, idioma e formato. `deliveryApplied` continua false. O observador paralelo pode atualizar expressão durante reprodução, sem alterar áudio já sintetizado. A ligação entre expressão e prosódia ainda é uma etapa pendente, não uma correção concluída nesta revisão. A orientação de síntese precisará estar disponível antes do áudio, e o impacto de qualquer espera deverá ser medido. O SDK oficial demonstra `generation_config.emotion` no WebSocket: [exemplos Cartesia](https://github.com/cartesia-ai/cartesia-python/blob/main/examples/examples.py). Compatibilidade e resultado acústico com a voz atual não foram testados.
