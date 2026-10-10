# Refinamento do Llama em etapas pequenas

Decisão de 07/10/2026, autorizada pelo usuário. O foco é o Llama 3.3 70B principal. Os modelos de reserva continuam funcionais, sem comparação de atuação nesta rodada. A integração do corpus está concluída e verificada localmente; naturalidade e fidelidade ainda não estão aprovadas.

## Sequência

1. Calibração humana com as fichas de 30 turnos já disponíveis. A avaliação humana distingue interlocução, continuidade e fidelidade à Kurisu. Medir a concordância do juiz e seus falsos positivos antes de confiar nas notas automáticas. A ficha não preenchida continua pendente; o agente não substitui o usuário nessa calibração.
2. Decomposição da latência: recuperação local, primeiro conteúdo bruto, cabeçalho de expressão, primeiro texto utilizável e geração completa. Controlar aquecimento, cache, rota e ordem. Diagnóstico não muda simultaneamente prompt, formato e provedor.
3. Braços isolados de atuação no desenvolvimento. Primeiro comparar exemplos contextuais adicionais, preservando o núcleo; registrar quantidades efetivas e fontes. Depois testar, uma variável por vez, diretivas por situação e tamanho proporcional. O roteiro completo de 720 turnos é uma preparação, não obrigação de gasto nesta rodada.
4. Memória e iniciativa em baterias separadas. Na memória, conferir fatos efetivamente injetados, uso correto, correções e recomendações baseadas em gostos. Na iniciativa, avaliar escolha de âncora, pertinência, brevidade e prioridade ao usuário. Não interpretar uma nota global de persona como prova desses mecanismos.
5. Validar a configuração escolhida nos cenários ainda reservados. H01/H02/H14/H31 permanecem diagnósticos observados. Checar sobreposição literal e semântica com a curadoria; congelar um conjunto novo caso a independência tenha sido perdida. Incluir sessões longas para medir deriva e repetição.
6. Medição em voz: tempo até o primeiro áudio, VAD, cortes, barge-in e presença. Essa etapa depende de autorização para eventual consumo de voz; o orçamento textual novo não autoriza gastar Cartesia.

## Orçamento da segunda rodada

- Identificador: `quality-v2-llama-small-steps-round-2`.
- Teto novo autorizado: US$ 0,25, agregado entre autor, juiz, falhas e reparos.
- Registro ativo: `code/backend/api/data/refinement/quality-v2-budget.json`.
- Registro anterior preservado: `quality-v2-first-round-budget.json`, na mesma pasta, com US$ 0,2322949165 contabilizados. Esse valor inclui reservas conservadoras; não é apresentado como cobrança exata do provedor.
- A abertura preserva o histórico sob o mesmo bloqueio exclusivo do executor. Os relatórios anteriores não são alterados.

US$ 0,25 é um teto apropriado para começar com uma bateria pequena. Não há evidência de que comporte todos os braços, a validação reservada completa e sessões longas com juiz. Planejar pilotos menores, guardar a cobertura efetiva e parar quando faltar margem. Não elevar o teto nem abrir outra rodada sem autorização. Calibração humana, inspeção de relatórios e diagnóstico estritamente local não consomem esse orçamento de inferência.

Esta abertura apenas registra a autorização e prepara o controle de gastos. Nenhuma inferência paga é executada por abrir a rodada. O saldo só diminui quando houver chamadas de avaliação; reiniciar a API ou executar outro comando não renova o teto.

## Estado após a execução

A primeira bateria textual desta seção foi executada: 268 de 270 turnos concluídos, com US$ 0,20724567 contabilizados no teto de US$ 0,25. A atuação ainda não está aprovada. A calibração humana está em 0/30; os cenários ainda reservados e a etapa de voz permanecem pendentes. A diretiva curta e a retirada de um bloco fixo da iniciativa foram braços de avaliação, sem alteração do prompt de produção.

Método, resultados, limitações, custos e ficha cega estão em [Resultados da rodada 2](Resultados_Refinamento_Llama_Rodada_2.md). A declaração sobre a abertura acima descreve a criação do registro; não significa que as execuções posteriores sejam gratuitas.
