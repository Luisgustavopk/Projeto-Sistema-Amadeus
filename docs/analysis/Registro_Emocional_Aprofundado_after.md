# Comparação emocional aprofundada — somente after

Rodada de 8 de outubro de 2026, autorizada com teto novo de **US$ 0,15**. Usou o roteiro aprovado nos três modelos, preservando as falas e removendo apenas os antigos turnos 3 e 6 de PBR47. Sem voz, juiz pago, dados pessoais ou alterações na configuração de produção.

## Cobertura realizada

**10 conversas completas por modelo, 58 turnos por modelo e 174 respostas no total.** Uma amostra por conversa. Os mesmos cenários chegaram aos três autores; cada autor continuou com seu próprio histórico. O pedido inicial de cada cenário teve o mesmo hash nos três modelos.

| Cenário | Situação                                     |
| ------- | -------------------------------------------- |
| PBR25   | Provocação insistente, irritação e reparo    |
| PBR35   | Luto, carinho e tristeza                     |
| PBR30   | Elogio à competência e orgulho               |
| PBR40   | Ansiedade, incerteza e alívio                |
| PBR44   | Curiosidade, entusiasmo e decepção           |
| PBR29   | Erro próprio, constrangimento e reparação    |
| PBR37   | Solidão, companhia e espaço pessoal          |
| PBR41   | Alegria, culpa e conquista                   |
| PBR47   | Elogio afetivo e implicância — quatro turnos |
| PBR38   | Confiança abalada e reaproximação            |

O conjunto aprovado completo tem 48 conversas e 238 turnos por modelo, incluindo a regressão anterior. **A cobertura desta rodada é parcial.** Permanecem sem execução PBR26, PBR27, PBR28, PBR31, PBR32, PBR33, PBR34, PBR36, PBR39, PBR42, PBR43, PBR45, PBR46 e PBR48, além dos 24 cenários anteriores. A iniciativa de PBR48 não foi testada nesta rodada.

## Orçamento e execução

- Gasto confirmado: **US$ 0,1290186792**.
- Saldo nominal: **US$ 0,0209813208**.
- 174 chamadas, nenhuma falha, nenhum custo desconhecido e nenhuma regeneração de formato.
- Parada: `BUDGET_GROUP_MARGIN`. A estimativa do próximo grupo de três conversas, somada à margem para uma chamada conservadora, não cabia no saldo. Não houve tentativa adicional após a parada.
- Uma amostra por conversa, temperatura 0,6 e contrato de resposta com cabeçalho de expressão; o processador manteve seus limites de geração. Pedidos finais e limites efetivamente usados foram registrados por tentativa.
- Rotas fixas, sem fallback: Llama `deepinfra/turbo`; DeepSeek e Qwen `deepinfra/fp8`. Raciocínio desativado no DeepSeek. Preços e parâmetros foram conferidos no catálogo antes das chamadas.
- Mesmo candidato after da rodada anterior: ficha, exemplos de estilo, direção de turno, complemento de presença, direção expressiva e correção da âncora. Não houve ajuste de comportamento durante a coleta.

## Medidas automáticas

Todas as células abaixo usam os mesmos 58 turnos completos por autor. São medidas de execução e formato, não notas de fidelidade.

| Medida                         | Llama 3.3 70B | DeepSeek V4.1 Flash |  Qwen2.5 72B |
| ------------------------------ | ------------: | ------------------: | -----------: |
| Primeiro conteúdo bruto, p50   |        1,20 s |              1,01 s |       1,51 s |
| Primeiro texto liberado, p50   |        4,17 s |              1,87 s |       3,91 s |
| Primeiro texto liberado, p95   |       10,84 s |              7,06 s |       7,05 s |
| Palavras por resposta, mediana |            24 |                  18 |         21,5 |
| Perguntas por turno            |         0,397 |               0,086 |        0,310 |
| Metadados válidos              |         35/58 |               52/58 |        42/58 |
| Custo confirmado               |  US$ 0,023864 |        US$ 0,023091 | US$ 0,082064 |

A fala pode ter sido liberada mesmo com metadados inválidos. Ausência de regeneração não equivale a acerto do cabeçalho. Estes tempos são de texto; não incluem STT, TTS, reprodução nem o controlador real de silêncio.

## Revisão e rastreabilidade

[Ficha cega com 58 itens A/B/C](../../code/backend/api/data/refinement/emotional-depth-after-015-2026-10-08/emotional-depth-after-review.md). Julgar as falas e o histórico antes de consultar autores ou metadados. As avaliações estão em branco.

[Transcrição com os autores identificados](../../code/backend/api/data/refinement/emotional-depth-after-015-2026-10-08/emotional-depth-after-transcription.md), para consulta após a revisão cega.

[Roteiro aprovado](../../code/backend/evals/persona/quality-v5/emotional-depth-pt-BR.md). O rascunho original foi preservado como histórico da proposta; o executor usa somente o arquivo aprovado.

Artefatos locais em `code/backend/api/data/refinement/emotional-depth-after-015-2026-10-08/`: plano congelado, orçamento persistente, respostas brutas, prompts efetivos, resumo, mapa privado A/B/C, auditoria e cópia dos arquivos de execução. Nenhuma chave está nesses artefatos. A auditoria confirmou o manifesto, o after em todas as tentativas, a ausência das duas falas removidas nos pedidos e a integridade dos 58 itens cegos. Os arquivos de execução usados foram preservados antes da limpeza de formatação local posterior à rodada.

**Naturalidade e fidelidade continuam pendentes de revisão.** Esta coleta não valida memória persistente, estado emocional entre sessões, voz ou experiência subjetiva. Não houve promoção de modelo nem preenchimento automático de referência humana.

Verificação local: oito testes pertinentes passaram, assim como typecheck, lint dos arquivos novos e formatação. A alteração de código ficou restrita à preparação e execução da avaliação; os conjuntos históricos mantiveram seu contrato.
