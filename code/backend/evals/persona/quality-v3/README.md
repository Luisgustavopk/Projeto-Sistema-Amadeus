# Avaliação textual v3

Roteiro adicional em pt-BR: [personalidade e transições emocionais](personality-pt-BR.md), com 12 conversas de quatro turnos. Está preparado, ainda sem respostas dos modelos ou execução paga. Ele complementa a revisão de memória; não altera os prompts ou o conjunto já executado.

Plano e decisões: [Refinamento_Persona_v3.md](../../../../../docs/analysis/Refinamento_Persona_v3.md).

## Revisão pessoal

Ao concluir a rodada, o avaliador grava `*-quality-v3-review.md` em `code/backend/api/data/refinement/quality-v3-025/`, com modelos misturados. Para focar no principal, `node scripts/review-llama-v3.mjs CAMINHO_DO_RELATORIO` produz `*-quality-v3-llama-review.md`: uma resposta por cenário e turno, escolhida por hash sem rótulos de qualidade. Esse é o arquivo prioritário para sua revisão pessoal. Seu JSON guarda as fichas estruturadas, inicialmente sem notas. Nele, todas as respostas são do Llama; a revisão é cega quanto ao ajuste, à amostra e às notas automáticas.

Leia as fichas antes de abrir `*-review-private.json` ou `*-transcription.md`, que revelam os autores e candidatos. Avalie somente a **resposta atual**; histórico e fatos são o contexto que permite julgá-la. Uma falha anterior conta para continuidade quando a fala atual a repete ou mantém.

Use `aprova`, `reprova`, `incerto` ou `não aplicável`, acompanhados de um motivo. Exemplo de formato:

```text
Item IDENTIFICADOR
Interlocução: ... — motivo
Proporcionalidade: ... — motivo
Sustentação factual: ... — motivo
Continuidade: ... — motivo
Persona: ... — motivo
Perguntas: ... — motivo
Recomendações: ... — motivo
Cânone: ... — motivo
```

Consulte a [rubrica](judge-rubric.md). Persona exige atuação contextual distinguível: firmeza com razão, curiosidade específica, calor discreto, constrangimento ou humor quando pertinentes. Educação, concisão ou uma menção a ciência não bastam. Uma saudação neutra pode ser adequada sem demonstrar fidelidade. Cânone aplica-se quando a resposta faz afirmações sobre a personagem ou seu recorte; recomendações aplicam-se quando há uma indicação.

Se as notas forem geradas por outra IA, identifique essa origem. Elas podem ajudar no diagnóstico, mas não viram referência humana. Uma futura calibração exige sua revisão pessoal e uma amostra distinta para validar o juiz depois de ajustar a rubrica.

## Artefatos e execução

Na pasta `code/backend/api`, `npm run eval:persona-v3` prepara sem inferência. `npm run eval:persona-v3 -- --run` executa com orçamento autorizado e compartilha o teto de US$ 0,25 desta rodada; reexecutar não renova o teto.

- `plan.json`: fontes, parâmetros, cenários e hashes congelados.
- `*-quality-v3.json`: pedidos finais, respostas brutas, fatos e histórico por turno, falhas e consumo.
- `*-summary.json`: métricas completas e comparações apenas entre conversas completas comuns aos braços.
- `*-review.md/json`: trinta fichas cegas, sem notas humanas prévias.
- `*-review-private.json`: mapa de autores e candidatos.
- `*-transcription.md`: transcrições com autores revelados.
- `*-memory-audit.json`: auditoria local do contrato de declaração factual, produzida depois da rodada por `node scripts/audit-persona-v3.mjs CAMINHO_DO_RELATORIO`.

A auditoria usa o parser real e verifica se os fatos aparecem no pedido e se os índices declarados existem. Ela não demonstra que a afirmação produzida é sustentada pelo fato: isso ainda exige revisão da resposta. O observador paralelo de expressão também não é um juiz de persona ou memória.

Os resultados ficam fora do Git. Não há chamadas de STT/TTS, alterações de produção ou promoção automática de modelo. Os novos diagnósticos foram escritos pelo agente que prepara o experimento e não equivalem a uma validação humana independente. As regressões antigas são explicitamente marcadas; cenários reservados já examinados não voltam a ser apresentados como inéditos.
