# Comparação dos três modelos com os ajustes v3

Rodada de 8 de outubro de 2026. O usuário autorizou apenas o saldo restante da rodada de US$ 0,25: **US$ 0,036469165**. Nenhum novo orçamento foi criado. A configuração de produção permanece com Llama como principal.

## Condições

- Llama 3.3 70B: OpenRouter → DeepInfra `deepinfra/turbo`.
- Qwen2.5 72B Instruct: OpenRouter → DeepInfra `deepinfra/fp8`, com status de catálogo −2 na preparação. A rota foi mantida fixa; não houve troca automática de modelo.
- DeepSeek V4.1 Flash: inicialmente OpenRouter → Morph `morph/fp8`. Três HTTP 429 impediram respostas. Foi feita uma tentativa complementar na DeepInfra `deepinfra/fp8`, também fixa e com raciocínio desativado.

Os prompts reutilizam os recursos congelados da rodada v3: núcleo, ficha, direções, presença positiva e os dez exemplos de estilo sem os exemplos que continham fatos sintéticos. Nos cenários com fatos, o mesmo bloco de memória fica imediatamente antes da fala atual. Não houve ajuste de prompt após ler respostas desta comparação.

Temperatura 0,6, formato com cabeçalho `<expression>`, mesmo processador textual da pipeline e limite de tokens definido pelo processador. Não foi aplicado o braço experimental de fala sem cabeçalho. Não houve STT, TTS, Cartesia, juiz pago, extração de memória ou alteração do banco pessoal.

Foram planejados quatro cenários de três turnos por modelo, uma amostra por cenário: 36 turnos. A primeira execução tentou 17 turnos antes de a reserva da próxima chamada ultrapassar o saldo. A recuperação do DeepSeek acrescentou três tentativas. Foram **20 tentativas de turno, 15 respostas finais utilizáveis e 22 chamadas**, contando reformulações. O cenário de iniciativa V3H04 não chegou a ser executado.

Esses cenários já haviam sido vistos na v3: são diagnósticos, não um novo conjunto reservado. Os históricos posteriores seguem as respostas do próprio modelo; não se pode tratar os nove turnos de uma conversa comparável como nove observações independentes.

## Conversa completa comparável

Somente V3H02 completou os três turnos com os três modelos. Ela fornece preferências em inglês, pede indicação em pt-BR, distingue indicação de experiência anterior e muda temporariamente para jogar sozinha. O hash do primeiro conjunto de mensagens foi idêntico nos três modelos:

`7eba2c22cc7d07ee205df6c8449a1a4d8892b584ce38e55284cc3d9b9625f2cb`

| Modelo   | Primeiro conteúdo bruto p50 | Primeiro texto utilizável p50 | Geração completa p50 | Palavras p50 | Perguntas/turno |
| -------- | --------------------------- | ----------------------------- | -------------------- | ------------ | --------------- |
| Llama    | 1,10 s                      | 5,71 s                        | 8,81 s               | 43           | 0               |
| DeepSeek | 0,96 s                      | 2,85 s                        | 4,37 s               | 56           | 0               |
| Qwen     | 1,01 s                      | 2,76 s                        | 3,67 s               | 48           | 0,33            |

São apenas três respostas por modelo, com históricos diferentes depois do primeiro turno. A execução do DeepSeek foi posterior e em uma rota diferente da inicialmente planejada. A pequena diferença de latência entre Qwen e DeepSeek não sustenta ranking. Estes números não incluem captura ou reprodução de áudio.

## Leitura qualitativa, ainda sem aprovação humana

- **Llama:** distinguiu recomendação de experiência, mas afirmou que Portal 2 não havia sido mencionado, apesar de o fato constar explicitamente nas mensagens. A falha ocorreu com contexto fornecido; não foi ausência de extração ou consulta ao SQLite. No cenário livre V3H01, devolveu perguntas ao usuário e introduziu uma atividade alegada de pensar em um projeto.
- **Qwen:** reconheceu Portal 2 corretamente e preservou as preferências ao mudar para uma indicação individual. Ainda devolveu perguntas e usou linguagem genérica. No cenário livre, abriu com perguntas sobre o dia, e um turno foi bloqueado duas vezes pelo validador de abertura. Houve também um stream encerrado durante a primeira tentativa de outro turno, seguido de reformulação bem-sucedida.
- **DeepSeek:** no caso completo, distinguiu recomendações de títulos já mencionados e explicou a mudança de cooperação para exploração individual. Minha leitura é de melhor continuidade nesse caso, mas as respostas foram mais longas: medianas de 56 palavras. A amostra é de recomendação, não cobre suficientemente os traços da Kurisu, e não comprova superioridade geral ou fidelidade.

Nenhum modelo recebe aprovação de naturalidade ou persona nesta rodada. Não houve calibração humana nem juízo independente pago. A transcrição e a ficha cega permitem revisar essa leitura.

## Falhas e orçamento

O validador de abertura faz parte das mesmas condições de execução dos três modelos. Quando ele interrompe um stream antes de chegar o custo informado pelo provedor, a reserva completa permanece contabilizada. Isso aconteceu com duas chamadas do Qwen; não deve ser descrito simplesmente como indisponibilidade da DeepInfra. Outra chamada do Qwen terminou sem stream completo. As três falhas do DeepSeek na Morph foram HTTP 429.

| Item                                                   | US$          |
| ------------------------------------------------------ | ------------ |
| Custo informado das novas chamadas                     | 0,0130348088 |
| Reservas novas mantidas sem custo confirmado           | 0,0208727250 |
| Total adicional contabilizado                          | 0,0339075338 |
| Total da rodada, incluindo consumo anterior e reservas | 0,2474383688 |
| Saldo disponível                                       | 0,0025616312 |

O total contabilizado não equivale a uma cobrança confirmada. As reservas não foram liberadas supondo que falhas sejam gratuitas. O saldo final não comporta outra chamada do Qwen com o mesmo prompt sob o limite conservador de reserva; não foi gasto em cenários diferentes para aparentar uma comparação maior.

O ledger original, seu teto de US$ 0,25 e seu manifesto `9eb4de3202f276f2d9c0ce4cb0b692715ad2da164ea0b9de8c164c9a5fe98a5d` foram preservados. O plano adicional tem impressão própria e referencia esse manifesto financeiro. Nenhum lock permaneceu ativo ao terminar.

## Artefatos e verificação

Os dados estão em `code/backend/api/data/refinement/quality-v3-025/`, ignorado pelo Git:

- `three-model-v3-continuation-plan.json` e `three-model-v3-continuation.json`: planejamento e primeira execução.
- `three-model-v3-recovery-plan.json` e `three-model-v3-recovery.json`: tentativa do DeepSeek na DeepInfra.
- `three-model-v3-consolidated.json`: dados reunidos, incluindo a tentativa substituída em `supersededCases`; os registros originais permanecem intactos.
- `three-model-v3-consolidated-summary.json`: métricas, custos e contagens incluindo todas as 20 tentativas.
- `three-model-v3-consolidated-transcription.md`: respostas identificadas por modelo.
- **`three-model-v3-consolidated-review.md`: ficha A/B/C de três itens para revisão**, com histórico próprio de cada resposta e fatos fornecidos.
- `three-model-v3-consolidated-review-private.json`: mapeamento das letras; evitar consultar antes da revisão.

O executor é `scripts/compare-three-models-v3.mjs`: sem argumentos prepara; `--run` executa. Ele compartilha o ledger anterior, verifica a implementação congelada e recusa executar novamente se seu relatório já existir. Não usar novamente o executor original da v3 para renovar esta rodada. A tentativa complementar e a consolidação estão preservadas como scripts locais na pasta dos artefatos.

Lint e formatação dos novos arquivos passaram. Os 15 testes de refinamento v3, rota fixa e orçamento compartilhado passaram antes das inferências. O relatório confirmou identidade das mensagens iniciais dos modelos nos cenários efetivamente comparados.
