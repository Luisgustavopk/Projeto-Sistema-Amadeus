# Avaliação de persona e atuação — fase 2

[scenarios-v1.json](scenarios-v1.json) contém 30 casos sintéticos, com histórico confirmado quando necessário e comportamento esperado, derivados da análise v0.4. [rubric-v1.json](rubric-v1.json) fixa oito critérios, escala 1–5 e desqualificações. Memória persistente ainda não existe: os casos de gravação/exclusão avaliam honestidade sobre esse limite, não certificam as operações da fase 3.

A versão `persona-suite-1.1` troca P18 pelo pedido explícito de história observado na interface. Preserve a versão do conjunto ao comparar relatórios. A persona segue como instrução de sistema nos provedores compatíveis; fala e histórico ficam na mensagem do usuário. A reserva contabiliza os dois campos.

## Coletar respostas

Na pasta `code/backend/api`:

```powershell
npm run eval:persona
npm run eval:persona -- --run --limit=30
```

O primeiro comando apenas valida o conjunto. O segundo consulta o LLM principal com conteúdo sintético e contabiliza uso na mesma base e nos mesmos limites da aplicação. Cada caso tem seu próprio histórico controlado; não usa conversas pessoais e não cria lembranças. Respostas, expressão proposta, falhas, latência e hash do prompt ficam em `api/data/persona-evals/`, ignorada pelo Git.

Para comparar um modelo **já configurado**, sem trocar a configuração da aplicação:

```powershell
npm run eval:persona -- --run --model=@cf/meta/llama-3.3-70b-instruct-fp8-fast --limit=30
```

A avaliação fixa o modelo selecionado e não mascara falhas com reservas. Para retomar outro dia ou separar lotes:

```powershell
npm run eval:persona -- --run --from=P11 --limit=10
```

Preserve os relatórios anteriores. Para o aceite, consolide os 30 IDs únicos da **mesma versão e hash do prompt e do mesmo modelo**. Não misture versões como se fossem um único ensaio. Falha interrompe o lote e salva o progresso; não aumenta cotas nem ativa faturamento. `firstSegmentMs` mede a primeira frase textual utilizável, não a latência microfone–áudio. Execute avaliações isoladas da conversa para não confundir cota e latência.

## Escuta com a referência ativa

Encerre a chamada na interface. Com API e TTS em execução:

```powershell
npm run check:persona-voice
```

São geradas três frases novas — explicativa, ironia discreta e acolhedora — com o **mesmo perfil ativo**. Os WAVs e medições de síntese, duração e saturação ficam em `api/data/persona-voice/<rodada>/`. Nenhuma candidata é ativada. Não são aplicados parâmetros emocionais não validados. A mudança de texto avalia continuidade de identidade; a ferramenta não afirma reproduzir cada intenção artisticamente.

Ouça sem avatar: identidade consistente entre frases, pt-BR, omissões, repetições, cortes, entonação e naturalidade. Esses três exemplos são uma triagem de continuidade; o gate de intenção de 80% exige ouvir o conjunto de avaliação completo, não apenas três frases. Para conversa real, use a interface de teste e a política de dados apropriada.

## Revisão e aceite

Nos relatórios, `inputText` é a pergunta e `text` é a resposta. Para cada resposta ouvida/revisada, preencha `scores` e `disqualifications`. Exemplo de notas, sem substituir sua avaliação:

```json
{
  "fidelity": 4,
  "naturalness": 4,
  "consistency": 4,
  "emotion": 4,
  "memory": 4,
  "speakability": 4,
  "honesty": 4,
  "identity": 4
}
```

`disqualifications` é `[]` somente quando revisado sem desqualificação; `null` significa pendente. No nível principal, preencha `voiceReview` após escuta do conjunto: `{"meanQuality":4,"intentRecognitionRate":0.8}`. Em seguida:

```powershell
npm run review:persona -- .\data\persona-evals\RELATORIO.json
```

A ferramenta exige 30 casos únicos revisados sem falha de execução, médias de fidelidade e naturalidade ≥4, zero desqualificação, qualidade vocal ≥4 e reconhecimento de intenção ≥80%. Notas ausentes mantêm `pending`; desqualificações produzem `rejected`. Ela calcula as notas fornecidas, não substitui julgamento humano nem escuta. Registre separadamente erros factuais e quais critérios motivaram cada nota. O aceite de fase 2 não elimina os ensaios físicos pendentes da fase 1.

## Ensaios de implementação — 04/10/2026

- Modelo principal `qwen/qwen3.8-27b`: primeiro caso bloqueado por `QUOTA_EXCEEDED` local; sem resposta gerada. O limite não foi alterado.
- Cloudflare `@cf/meta/llama-3.3-70b-instruct-fp8-fast`: um caso real na versão `0.4.1`; metadados válidos, primeira frase textual em aproximadamente 2,03 s. A resposta inventou trabalho no laboratório e requer reprovação no critério de honestidade/identidade. Motivou o reforço do prompt em `0.4.2`; correção ainda sem reteste completo.
- Gemini `gemini-3.8-flash`: primeiro caso retornou `PROVIDER_TEMPORARILY_UNAVAILABLE`; nenhum lote completo executado.
- Três WAVs da referência atual: duração de 6,32 s, 4,56 s e 5,76 s; síntese aproximada de 3,72 s, 2,51 s e 3,15 s; nenhuma amostra em saturação digital. Naturalidade e identidade ainda dependem da escuta. Este resultado é síntese isolada, não ensaio da chamada inteira.

Não há justificativa suficiente para mudar automaticamente o LLM ou a voz com esses dados. Mantém-se a cadeia configurada com suas políticas e a voz aceita provisoriamente. O conjunto de 30 casos, comparação de modelos, revisão humana e gate vocal continuam pendentes. Fine-tuning permanece opcional, sem treinamento nesta etapa.

## Regressões de conversa

`dialogue-v1.json` contém quatro casos sintéticos independentes: palavra incompreensível, avaliação do assunto, crítica leve à persona e pedido para parar brincadeiras. O histórico é controlado e confirmado no cenário; não usa uma conversa privada real.

```powershell
npm run eval:persona -- --dialogue
npm run eval:persona -- --dialogue --run --limit=4 --model=@cf/meta/llama-3.3-70b-instruct-fp8-fast
```

Use `--from=D02` para retomar um lote. Esses casos têm IDs D01–D04 e não substituem os 30 casos P01–P30 do aceite. Os relatórios preservam modelo, versão e hash; não misture resultados de prompts diferentes. Cotas e políticas são respeitadas.
