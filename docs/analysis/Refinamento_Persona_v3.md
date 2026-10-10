# Refinamento da persona — rodada v3

## Escopo e decisão

Rodada textual autorizada em 8 de outubro de 2026, com teto agregado novo de **US$ 0,25**, incluindo classificações auxiliares e reservas de chamadas sem custo informado. Llama 3.3 70B continua como foco e modelo principal. DeepSeek é referência de comparação. Não há STT, TTS, treino ou troca do modelo em produção.

Os ajustes são candidatos exclusivamente no avaliador. A aprovação de personalidade e naturalidade continua pendente de revisão humana.

## Proveniência da avaliação anterior

As notas A/B/C enviadas na conversa são explicitamente de outro modelo. Foram registradas em `code/backend/evals/persona/quality-v3/model-review-comparison.json` como `external-model`, sem confirmação humana e com inferência de autoria revelada. Não são dados para calibrar um juiz contra humanos.

O mapa privado confirma X = Qwen, Y = Llama e Z = DeepSeek. Recontando as tabelas por item, o Llama tem continuidade 8/2/2 e persona 0/8/4 (aprova/reprova/incerto), corrigindo duas somas da análise recebida. Os julgamentos individuais foram preservados.

O documento de calibração anterior recebeu uma ressalva de proveniência: concordância com rótulos recebidos não demonstra concordância com um avaliador humano. Nesta rodada não se paga um juiz de persona nem se usa aprovação automática para promover um candidato.

## Fatores isolados

| Comparação              | Única mudança avaliada                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `baseline` → `isolated` | Retira dois exemplos demonstrativos com fatos pessoais sintéticos; mantém dez exemplos de estilo, núcleo, atuação e formato.  |
| `isolated` → `acting`   | Substitui somente o complemento de presença por direções positivas em Markdown, com referências às fontes curadas.            |
| `acting` → `grounded`   | Desloca o mesmo bloco de fatos para imediatamente antes da fala atual; conteúdo, permissões e identidade dos fatos não mudam. |
| `header` → `plain`      | Em cenários sem fatos persistentes, compara o protocolo de expressão com fala simples e um observador de expressão paralelo.  |

O filtro dos exemplos usa metadados estruturados (`kind` e `facts`), sem palavras-chave, regras de identidade ou reescrita de respostas. A posição da memória funciona igualmente com fatos em inglês ou francês, verificados nos testes locais.

O observador paralelo classifica o primeiro segmento emitido e guarda o resultado no relatório. Ele não modifica os eventos de expressão da produção, não valida memória e pode chegar depois da fala; a expressão inicial continua neutra. Este ensaio mede a hipótese de latência, não entrega ainda uma integração de voz aprovada.

## Método e controles

- Seis casos de atuação/regressão, com cinco amostras por candidato e autor; comparações factuais adicionais em dois casos de memória.
- Quatro diagnósticos novos, congelados antes de executar os braços. São disjuntos textualmente dos exemplos, mas foram criados pelo agente do experimento: não equivalem a validação humana independente.
- Dois casos de latência, com duas amostras por formato e autor, executados primeiro.
- Plano: 696 turnos de autor e 24 observações auxiliares. Estimativa inicial sem cache: US$ 0,21416 para os autores, sujeita ao comprimento real e às falhas.
- Cada chamada reserva orçamento antes de começar; falhas sem custo informado mantêm a reserva. O limite pode encerrar o plano antes do último caso.
- Fontes, código, cenários e parâmetros têm hashes congelados. Os orçamentos anteriores permanecem intactos em seus diretórios.
- Comparações usam somente conversas completas presentes nos dois braços; respostas parciais e falhas aparecem separadamente.
- Guardam-se mensagens finais, fatos injetados, resposta bruta, falhas, consumo, primeiro conteúdo bruto, primeira fala e primeiro texto utilizável. Os tempos incluem o agrupador real de fala, sem STT/TTS.
- A memória deste ensaio usa fatos sintéticos já recuperados e fornecidos ao processador. Ele testa sua injeção e leitura pelo autor, sem executar extração, persistência no SQLite ou recuperação semântica de ponta a ponta. Os tempos também incluem o registro durável local do avaliador, conservado para controlar o orçamento.
- Trinta fichas estratificadas são preparadas para revisão cega. O arquivo de autores fica separado. Critérios sem aplicação não contam como aprovação.
- Uma seleção adicional dedica a revisão ao Llama: uma resposta por cenário e turno, escolhida por hash sem notas de qualidade, com ajuste e amostra ocultos. Todas as respostas desse arquivo são do modelo principal; não há cegamento de autoria entre modelos nesse conjunto.

## Rotas e preços congelados

Llama: `deepinfra/turbo`, teto US$ 0,10 entrada / US$ 0,32 saída por milhão. DeepSeek: `morph/fp8`, teto US$ 0,045 / US$ 0,60 por milhão, com raciocínio desativado. O catálogo público é conferido antes da rodada; roteamento reserva está desabilitado no avaliador.

A rota anterior `inference-net/fp8` passou de US$ 0,045/0,30 para US$ 0,12/0,60. O controle bloqueou a preparação antes de inferir. Morph foi escolhida para preservar FP8 e reduzir custo de entrada. Os tempos desta rodada não devem ser comparados diretamente aos da rota anterior como efeito de prompt.

## Execução

Na pasta `code/backend/api`:

```powershell
npm run eval:persona-v3
npm run eval:persona-v3 -- --run
```

O primeiro comando prepara e consulta o catálogo sem inferência. O segundo exige orçamento autorizado; reexecutá-lo consome o saldo da mesma rodada, sem renovar o teto.

Artefatos locais ficam em `code/backend/api/data/refinement/quality-v3-025/`. Por compatibilidade com o contador existente, o nome interno do arquivo de orçamento ainda é `quality-v2-1-budget.json`; o diretório, hashes e teto são próprios desta rodada.

## Critério para prosseguir

Selecionar candidatos por evidência equilibrada, revisar as fichas pessoalmente e só então calibrar um juiz em uma amostra distinta. Persona requer avaliação contextual; concisão, poucas perguntas e correção factual são medidas auxiliares, não substitutos. Uma integração eventual em produção deve preservar validação de fatos, interrupção, prioridade ao usuário e ser medida também em áudio.
