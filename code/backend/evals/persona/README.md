# Avaliação de persona e atuação — fase 2

## Decisão atual — 05/10/2026

A 0.4.11 concluiu 30/30 casos no Qwen gratuito via OpenRouter. Revisão por Codex: fidelidade e naturalidade 3,13/5, com 11 respostas boas e 19 para revisar. O diálogo realmente encadeado concluiu 8/12 turnos; cotas impediram o restante. Relatórios e revisão detalhada ficam localmente em `api/data/persona-evals/`, fora do Git.

A 0.4.12 centraliza a direção principal em `assets/persona/conversation-directions-v1.md` e reduz redundâncias. Reteste de 05/10/2026: Groq/Qwen concluiu 9 respostas antes de cota; Cloudflare/Llama tentou os 30 cenários e concluiu 28. Revisão por Codex dessas 28 respostas: fidelidade 3,25/5 e naturalidade 3,50/5, com 15 boas e 13 para revisar. P29 falhou duas vezes com `PROVIDER_INVALID`: JSON/rubrica na saída bruta foram bloqueados, sem fala entregue. P30 ficou sem resposta por cota da Cloudflare e indisponibilidade do Gemini. A nova continuidade ficou bloqueada em D01 no Groq; os oito turnos da versão anterior não foram reutilizados como evidência da nova versão.

O prompt manteve o mesmo hash durante a coleta. `api/data/persona-evals/review-0.4.12.md` e `review-0.4.12-groq.md` preservam a análise separada por modelo, respostas e falhas; permanecem locais e ignorados pelo Git. Diferenças de provedor/modelo e cobertura impedem atribuir o resultado apenas ao prompt ou certificar melhora estável. Repetição de exemplos fora do gatilho, correção científica insuficiente e limites de contexto ainda exigem ajustes; P19 recebe sinalização do agente por chamar o usuário de Okabe sem enquadramento ficcional. Notas humanas continuam pendentes; voz não foi retestada e seu aceite foi preservado.

O usuário autorizou a [transição provisória para a fase 3](../../../../docs/decisions/Decisao_Persona_Fase_3.md), com técnicas avançadas após a memória. Preserve os gates como pendentes; testes de código e autorização de transição não certificam melhora de naturalidade. Cotas, configuração ativa e prompt não foram alterados para concluir a coleta.

[scenarios-v1.json](scenarios-v1.json) contém 30 casos sintéticos, com histórico confirmado quando necessário e comportamento esperado, derivados da análise v0.4. [rubric-v1.json](rubric-v1.json) fixa oito critérios, escala 1–5 e desqualificações. Memória persistente ainda não existe: os casos de gravação/exclusão avaliam honestidade sobre esse limite, não certificam as operações da fase 3.

A versão `persona-suite-1.1` troca P18 pelo pedido explícito de história observado na interface. Preserve a versão do conjunto ao comparar relatórios. A persona segue como instrução de sistema nos provedores compatíveis; fala e histórico ficam na mensagem do usuário. A reserva contabiliza os dois campos.

## Coletar respostas

### Rodada curta — persona 0.4.13

`refinement-v1.json` (`persona-refinement-1.0`) contém oito regressões observadas em saudações, elogios, reparo científico, biografia, memória, formato, identidade e rótulos; as quatro situações novas avaliam elogio específico, correção de outra afirmação, fatos corrigidos da sessão e ficção solicitada. Não são um diálogo encadeado: cada caso tem histórico sintético controlado. As situações novas não foram incluídas como exemplos no prompt, mas foram criadas pelo mesmo autor do ajuste; isso não constitui um teste cego independente nem comprova generalização ampla.

```powershell
npm run eval:persona -- --refinement
npm run eval:persona -- --refinement --run --limit=12 --model=qwen/qwen3.8-27b --interval-ms=60000
```

O primeiro comando valida localmente; o segundo gera respostas e contabiliza tentativas na mesma base. Use `--from=D04` para retomar cenários independentes depois de uma falha. As opções de conjunto (`--refinement`, `--continuity`, `--dialogue`, `--skill`) são mutuamente exclusivas. IDs D01–D12 podem existir em conjuntos distintos; consolide pela versão do conjunto, persona, hash e modelo, nunca apenas pelo ID. Preserve falhas e modelos em relatórios separados. A versão 0.4.13 tem hash próprio e não reutiliza notas antigas como aprovação.

O aceite completo ainda exige os 30 cenários e o diálogo de 12 turnos no modelo escolhido, com cota suficiente. Não acrescente este conjunto a treinamento nem ao prompt. Os relatórios de inferência e a revisão por agente permanecem locais, em `api/data/persona-evals/`.

**Coleta em 05/10/2026:** Groq concluiu D01–D03 e D09 (quatro de doze); Gemini concluiu apenas D01; Cloudflare ficou bloqueado por cota. O Groq admitiu e corrigiu o erro sobre neurônios, e os elogios não introduziram perfeição. A saudação continuou artificial e D09 repetiu a frase de D02, sem retomar o benefício específico. Houve espera pelo `retry-after` antes da coleta de D09; D10 foi bloqueado com nova espera informada de cerca de 34 minutos. Restam cinco regressões e três situações novas no Groq. O comando salva `retryAfterMs` quando fornecido pelo provedor, sem inferir prazo quando ausente. Análise local: `api/data/persona-evals/review-0.4.13.md`. Nenhuma nota do Gemini foi misturada ao Groq; o conjunto curto e o gate de qualidade continuam incompletos.

Retomada dos casos faltantes no Groq, quando houver cota, sem repetir os quatro já coletados:

```powershell
npm run eval:persona -- --refinement --run --from=D04 --limit=5 --model=qwen/qwen3.8-27b --interval-ms=60000
npm run eval:persona -- --refinement --run --from=D10 --limit=3 --model=qwen/qwen3.8-27b --interval-ms=60000
```

Se um lote interromper antes do fim, retome a partir do ID com erro e limite o restante desse intervalo. O prazo informado pelo provedor não garante orçamento para todos os casos. O OpenRouter permanece com o teto local autorizado de 60 pedidos, sem aumento para esta coleta.

### Conjunto completo

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

### Continuidade textual encadeada

`continuity-v1.json` contém doze falas inteiramente fictícias. Diferentemente dos
casos independentes, `--continuity` usa cada resposta realmente gerada como
histórico do turno seguinte, com orçamento de contexto e estado expressivo da
produção. Registra também o histórico efetivamente incluído (`sentHistory`).

```powershell
npm run eval:persona -- --continuity --run --limit=12 --model=qwen/qwen3.8-27b:free --interval-ms=60000
```

O teste começa em D01; não permite pular turnos com `--from`. Só respostas
completas sem erro alimentam o próximo turno. A confirmação de reprodução é
**simulada para avaliação textual**: nenhum áudio foi sintetizado ou ouvido.
Os cenários verificam correção de fatos, retomada, ficção versus vivência,
mudanças de assunto e de tom, pedido para não perguntar e limites de memória.
Reduza `--limit` para uma coleta parcial quando o orçamento não comportar doze
turnos, identificando explicitamente essa limitação no relatório.

Os contadores continuam sendo os mesmos da aplicação. Não aumente os limites
sem autorização explícita do operador nem descarte tentativas anteriores para completar um relatório; registre a
pendência de coleta quando a cota impedir a continuação.

Para retomar um diálogo interrompido, use `--continuity --run --resume=TIMESTAMP-persona.json`.
A ferramenta exige a mesma versão, hash do prompt e conjunto, restaura apenas
o prefixo de respostas completas e preserva o relatório original. Cada novo turno
registra o provedor e modelo; uma troca de modelo deve ser identificada na análise.

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
