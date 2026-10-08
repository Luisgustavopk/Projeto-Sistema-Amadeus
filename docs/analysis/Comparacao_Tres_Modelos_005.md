# Comparação exploratória Llama × DeepSeek × Qwen2.5

## Preparação — 8 de outubro de 2026

O Qwen2.5 72B Instruct participa somente do avaliador. A produção continua com o Llama. A preparação não executa inferência, não consome créditos e não cria um novo registro de gasto. O teto de US$ 0,05 abaixo é uma proposta para uma nova rodada, cuja execução depende da autorização do usuário; o orçamento anterior permanece registrado e não se renova.

| Modelo                 | Rota fixa no OpenRouter                    | Entrada / milhão | Saída / milhão |
| ---------------------- | ------------------------------------------ | ---------------: | -------------: |
| Llama 3.3 70B Instruct | `deepinfra/turbo`                          |         US$ 0,10 |       US$ 0,32 |
| DeepSeek V4.1 Flash    | `inference-net/fp8`, raciocínio desativado |        US$ 0,045 |       US$ 0,30 |
| Qwen2.5 72B Instruct   | `deepinfra/fp8`                            |         US$ 0,36 |       US$ 0,40 |

O identificador do Qwen é `qwen/qwen-2.5-72b-instruct`. As rotas são consultadas no catálogo público antes de executar: precisam estar disponíveis, aceitar os parâmetros e respeitar esses tetos de preço. Não há troca automática de provedor nesta avaliação. Fontes: [modelo Qwen no OpenRouter](https://openrouter.ai/qwen/qwen-2.5-72b-instruct) e [catálogo de endpoints](https://openrouter.ai/api/v1/models/qwen/qwen-2.5-72b-instruct/endpoints). Latência anunciada no catálogo não equivale ao tempo até a primeira fala utilizável no Amadeus.

## Desenho e custo esperado

São seis conversas de desenvolvimento/diagnóstico já usadas no piloto anterior: D01, D02, D05, M01, M03 e I01. Cada uma tem três turnos e uma amostra por modelo: 18 respostas por modelo, 54 respostas no total. Elas cobrem escolha de assunto, elogio/discordância, continuidade de uma escolha, recomendações com preferências, retomada de plano adiado e iniciativa ancorada. Esses casos não são um conjunto reservado novo.

Mantêm-se o braço `card-shots`, os exemplos, fatos sintéticos, histórico inicial, temperatura 0,6 e contratos do processador. O histórico posterior inclui a resposta de cada autor. A ordem dos modelos varia entre cenários. O experimento compara modelo **e rota**, sem atribuir a diferença de velocidade somente ao modelo.

Estimativa com 3.800 tokens de entrada e 70 de saída por turno, sem desconto de cache:

| Modelo    |    18 respostas |
| --------- | --------------: |
| Llama     |     US$ 0,00724 |
| DeepSeek  |     US$ 0,00346 |
| Qwen2.5   |     US$ 0,02513 |
| **Total** | **US$ 0,03583** |

Com 4.000 tokens de entrada e 100 de saída por turno, o total seria US$ 0,03820. Há margem dentro de US$ 0,05 para variação moderada, mas a estimativa não garante concluir todos os turnos: respostas maiores, reparos de formato ou falhas de cobrança desconhecida podem consumir essa margem. Duas amostras dos mesmos seis cenários custariam aproximadamente US$ 0,07165 e não caberiam no teto.

Não há voz, extração de memória ou juiz pago. Memória e iniciativa usam fatos e eventos simulados: esta rodada avalia como o modelo utiliza esse contexto, sem validar busca no banco ou o agendamento real da presença.

## Execução e análise

Na pasta `code/backend/api`:

```powershell
# Apenas prepara: consulta catálogo público, sem gastar créditos.
npm run compare:models-three

# Executa somente após autorizar a nova rodada de até US$ 0,05.
npm run compare:models-three -- --run

# Resumo offline com o mesmo conjunto completo nos três modelos.
node scripts/summarize-llama-deepseek.mjs NOME_DO_RELATORIO.json --three-models
```

A chave é a `OPENROUTER_API_KEY` existente. Planos, relatórios, fichas cegas A/B/C e gasto ficam em `data/refinement/models-three-005/`. O registro de orçamento usa o formato existente `quality-v2-1-budget.json` dentro desse diretório independente. Reexecuções mantêm o gasto acumulado; divergência de configuração congelada bloqueia continuar a rodada. O registro histórico do piloto de dois modelos permanece no diretório pai.

O avaliador reserva um limite conservador antes de cada chamada e registra a rota final antes de enviá-la. Ao receber o custo, reconcilia a reserva. Se não houver custo confiável, conserva a reserva. Quando não há saldo para a próxima reserva, para antes da chamada.

Os relatórios distinguem primeiro conteúdo bruto, primeiro texto depois dos metadados, primeiro texto utilizável pelo processador e geração completa. Medem também comprimento, perguntas, formato, custo e fatos enviados. A revisão humana das fichas deve considerar interlocução, persona, continuidade e sustentação factual. Uma amostra por cenário permite escolher candidatos para a próxima rodada; não aprova fidelidade nem sustenta uma conclusão estatística sobre o melhor modelo.

## Resultado da rodada autorizada

O usuário autorizou executar esta nova rodada com o teto proposto de US$ 0,05. A execução terminou em 8 de outubro de 2026, com 48 respostas úteis: 18 do Llama, 18 do DeepSeek e 12 do Qwen. Houve 52 chamadas, 49 concluídas e três sem conclusão normal, todas no braço Qwen. A contagem de chamadas inclui as tentativas de recuperação do processador; não equivale à contagem de respostas finais.

O Qwen recuperou o segundo turno de D02 após uma tentativa interrompida. D05 falhou no primeiro turno após duas tentativas. Em I01, a reserva foi bloqueada antes de enviar qualquer chamada Qwen: isso é parada por orçamento, não falha de resposta do modelo. As três tentativas interrompidas estão registradas como `EVALUATION_CALL_FAILED` (duas) e `EVALUATION_STREAM_CLOSED` (uma), sem custo informado. O registro não contém a causa original suficiente para atribuir esses encerramentos exclusivamente ao provedor ou ao modelo.

O conjunto principal comparável tem **quatro conversas completas por modelo, 12 respostas por modelo**: D01, D02, M01 e M03. Os hashes dos primeiros prompts coincidem nos três autores em todos esses cenários. D05 e I01 de Llama/DeepSeek são diagnósticos suplementares, sem comparação contra Qwen.

| Medida no conjunto comum                                     | Llama 3.3 70B | DeepSeek Flash | Qwen2.5 72B |
| ------------------------------------------------------------ | ------------: | -------------: | ----------: |
| Primeiro conteúdo bruto, p50                                 |        1,20 s |         1,25 s |      1,28 s |
| Primeiro texto utilizável, p50                               |        2,95 s |         1,92 s |      3,13 s |
| Primeiro texto utilizável, p95 da amostra                    |        4,91 s |         7,77 s |     17,51 s |
| Palavras por resposta, mediana                               |          19,5 |           21,5 |        17,5 |
| Perguntas por turno                                          |          0,42 |              0 |        0,42 |
| Metadados válidos                                            |         12/12 |           9/12 |       12/12 |
| Custo informado nas conversas comuns, incluindo recuperações |   US$ 0,00506 |    US$ 0,00194 | US$ 0,01744 |

O custo Qwen dessa tabela exclui US$ 0,00582 reservados para a tentativa sem custo conhecido em D02; suas duas tentativas malsucedidas em D05 também ficam fora da tabela, pois D05 não pertence ao conjunto comum. Houve desconto de cache no DeepSeek, mas não nos outros dois. Os custos são observados nesta execução, não preços universais por conversa. O p95 tem somente 12 observações e não é uma estimativa estável de latência em produção. Nenhum desses tempos inclui STT, TTS ou busca real no banco.

### Revisão qualitativa dos resultados

Esta revisão foi feita pelo agente, sem juiz pago. As 12 fichas cegas A/B/C estão disponíveis para a revisão humana; não há aprovação humana de fidelidade nesta rodada.

- **D01, assunto livre:** DeepSeek escolheu uma ideia concreta e desenvolveu a relação entre confiança e precisão da lembrança. Ainda houve concentração no tema memória. Llama devolveu a escolha com uma pergunta sobre filme favorito; Qwen pediu ao usuário um experimento recente e, no turno seguinte, passou a perguntar sobre um experimento que não havia sido apresentado. Ambos falharam em assumir a escolha como solicitado.
- **D02, elogio e discordância:** DeepSeek respondeu “Tá, aceito. Obrigada.” e distinguiu desacordo de argumento. É o sinal mais claro de contenção e posição própria, embora a primeira resposta acrescente uma ressalva científica desnecessária ao elogio. Qwen foi curto, mas predominantemente formal; Llama atribuiu uma razão ao desacordo sem que ela tivesse sido apresentada. Nenhum caso isolado comprova fidelidade à personagem.
- **M01, preferências como critérios:** DeepSeek e Qwen distinguiram indicação nova de experiência anterior e usaram as preferências fornecidas. Llama afirmou “Seu gosto por desenhar fachadas antigas”, informação ausente dos fatos do cenário e presente apenas numa demonstração fictícia do banco de exemplos. É transferência indevida de um fato do exemplo para a pessoa. A métrica de cópia literal de oito palavras não capturou essa contaminação semântica. A adequação de todas as características dos jogos indicados não recebeu verificação externa nesta rodada.
- **M03, plano adiado:** DeepSeek e Qwen recuperaram a horta. Qwen voltou a ofertas de ajuda em dois turnos. Llama declarou que não havia plano registrado, apesar de a horta estar no prompt, e transformou o adiamento em prazo para começar. DeepSeek incorporou o adiamento, mas “Você não chegou a definir um orçamento” extrapola a ausência de registro: deveria limitar-se a dizer que o valor não foi informado.
- **D05, continuidade — diagnóstico de dois modelos:** Llama voltou à primeira abordagem após o usuário selecionar a segunda. DeepSeek permaneceu no teste por repetição de medições, embora a separação entre deriva e ruído dependa do desenho do teste. Qwen não produziu uma resposta final, portanto sua continuidade não foi avaliada.
- **I01, iniciativa — diagnóstico de dois modelos:** DeepSeek retomou o relógio da cena; Llama perdeu a âncora e ofereceu ajuda e assunto genérico. Qwen não foi chamado por falta de saldo para a reserva. O ensaio simula o evento de iniciativa e não valida o controlador real de presença.

### Contabilidade e conclusão

Em toda a rodada, o custo **informado** foi US$ **0,02721753**. As três tentativas Qwen sem custo conhecido mantiveram US$ **0,01717116** de reserva. O total comprometido conservador ficou em US$ **0,04438869**, com US$ **0,00561131** restantes. A próxima reserva Qwen excederia esse saldo, e o avaliador parou com `EVALUATION_BUDGET_EXHAUSTED`, antes da chamada. As reservas não são uma confirmação de cobrança efetiva.

O registro histórico da rodada anterior permaneceu em US$ 0,2483426475. A trava da nova rodada foi removida ao concluir. Não houve voz, juiz pago, dados pessoais reais ou alteração do modelo principal da produção.

**Leitura prática:** DeepSeek é o candidato mais promissor deste piloto para interlocução e aproveitamento dos fatos, com mediana de texto utilizável menor, mas formato, extrapolações e picos ainda precisam de atenção. Qwen não apresentou vantagem de latência utilizável, foi mais caro nesta comparação e também voltou ao atendimento. O Llama mantém falhas relevantes de continuidade, iniciativa e separação entre exemplos e fatos. Naturalidade e fidelidade seguem sem aprovação; o resultado não promove nenhum modelo automaticamente.

Relatórios locais em `code/backend/api/data/refinement/models-three-005/`:

- `1791436267797-llama-deepseek.json`: chamadas, prompts finais, fatos, respostas, tempos e orçamento.
- `1791436267797-llama-deepseek-matched-audit.json`: métricas com o mesmo conjunto nos três modelos.
- `1791436267797-llama-deepseek-blind.md` e `.json`: 12 fichas A/B/C, sem o mapeamento privado de autores.
- `1791436267797-llama-deepseek-pairs-private.json`: mapeamento dos autores para conferir após avaliar as fichas.
