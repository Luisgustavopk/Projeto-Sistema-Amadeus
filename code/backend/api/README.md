# API

## Provedores LLM e reservas

O LLM pode usar Gemini, Groq ou Cloudflare Workers AI. Groq e Cloudflare usam endpoints oficiais compatíveis com Chat Completions e suportam entrega SSE. Configure suas chaves somente no ambiente da API (`GEMINI_API_KEY`, `GROQ_API_KEY` e `CLOUDFLARE_AI_TOKEN`); nunca envie valores de segredo no JSON da configuração. Para privilegiar baixa latência, esta instalação local usa Groq como principal, Cloudflare como primeira reserva e Gemini por último. Um smoke test sintético isolado mediu o primeiro texto em 303 ms no Groq e 398 ms no Cloudflare, enquanto o Gemini estava sem cota. Esses valores não representam a conversa completa nem garantem desempenho futuro.

`llm.fallbackProviders` aceita até dois provedores alternativos ordenados. Exemplo parcial para mesclar à configuração atual:

```json
{
  "llm": {
    "adapter": "groq",
    "model": "qwen/qwen3.8-27b",
    "apiKeyEnv": "GROQ_API_KEY",
    "fallbackProviders": [
      {
        "adapter": "cloudflare-ai",
        "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "apiKeyEnv": "CLOUDFLARE_AI_TOKEN",
        "accountId": "<id-da-conta-cloudflare>"
      },
      {
        "adapter": "gemini",
        "model": "<modelo-gemini-configurado>",
        "apiKeyEnv": "GEMINI_API_KEY"
      }
    ]
  }
}
```

Para configurar via `PUT /v1/providers`, primeiro obtenha a configuração completa por `GET /v1/providers`, defina o provedor principal e `fallbackProviders` em `llm` e preserve as configurações atuais de STT/TTS. O Cloudflare exige o ID da conta e um token com permissão de inferência do Workers AI. Modelos e disponibilidade podem mudar. `fallbackModel` continua aceito para instalações antigas com Gemini, mas não pode ser combinado com `fallbackProviders`.

A cadeia tenta os provedores na ordem configurada apenas após cota (HTTP 402/429) ou indisponibilidade temporária (408/5xx), e somente antes de entregar o primeiro fragmento. Chave/permissão inválida, modelo/parâmetros recusados, cancelamento, resposta parcial e falha de persistência não iniciam outra geração. Cada reserva tem `dataPolicy` próprio (omitido significa `synthetic-only`); para `personal-approved`, configure também `policyReviewedAt` e `policyReference` para cada provedor. O Gemini exige ainda `geminiTier: "paid"` para qualquer processamento pessoal; sem isso, permanece inelegível para dados pessoais. Esse campo é uma declaração do operador, não uma verificação automática de faturamento: use-o somente com acesso Gemini pago (projeto Google Cloud com faturamento ativo ou conta Workspace elegível) e após revisar os termos. Chamadas pessoais excluem provedores sem aprovação antes de enviar conteúdo ou reservar uso; sessões sintéticas continuam usando a cadeia completa. Os limites são compartilhados e cada tentativa é contabilizada separadamente; `GET /v1/usage` mostra o modelo e `isFallback`, `GET /v1/capabilities` informa as políticas da cadeia, e `provider.fallback` registra origem, destino e motivo sem chave nem conteúdo.

As cotas grátis não são SLA e são independentes por provedor: os limites Groq dependem da organização e devem ser verificados na conta; Workers AI publica 10.000 Neurons gratuitos por dia, compartilhados entre modelos e renovados diariamente. Essa cota não equivale a um número fixo de conversas. A saúde do Groq faz uma consulta de modelos, que não verifica a cota de geração; no Cloudflare, `available` indica apenas que a configuração local foi carregada e não testa a chave, conectividade nem quota. Mesmo com a cadeia configurada, todas as alternativas podem estar indisponíveis. O envio de transcrições/contexto a provedores terceiros depende da política de dados aprovada.

## Conversa e diagnóstico de voz

`llm.thinkingLevel` configura o raciocínio do Gemini (`low`, `medium`, `high`) quando Gemini está ativo; outros provedores ignoram essa opção. A resposta falada é orientada a uma ou duas frases por padrão. Para iniciar o TTS mais cedo, trechos longos também podem ser enviados à síntese nas pausas naturais após vírgula ou ponto e vírgula; isso pode aumentar o número de segmentos e alterar a prosódia entre eles.

O STT retorna `NO_SPEECH_DETECTED` para áudio válido sem fala. A captura candidata é descartada e a resposta anterior, se houver, continua; esse caso contabiliza `noSpeech` e não é tratado como indisponibilidade. Erros reais de validação continuam visíveis. O serviço local enfileira até uma inferência enquanto outra está ocupada; HTTP 429 indica fila cheia e 400 entrada recusada. No cliente, o VAD exige 160 ms acima do limiar e preserva 160 ms anteriores à fala, mas não interrompe por si só: durante a captura e a transcrição STT, a resposta atual continua. Ela só é interrompida após `transcript.partial` com palavras durante a captura ou `transcript.final` não vazio; a interrupção manual permanece imediata.

Cada usuário tem uma única chamada de voz ativa. Abrir outra chamada válida substitui a anterior, interrompe seus trabalhos e fecha o socket anterior com 4001. Isso evita duas abas transcrevendo o mesmo microfone e reproduzindo respostas sobrepostas. Geração concluída e fim da reprodução são acompanhados separadamente: ambas precisam terminar para voltar a `idle`. Falhas não deixam um turno ativo sem execução.

Se não houver perfil de voz ativo, a resposta textual ainda pode ser gerada, mas a API emite `VOICE_NOT_READY` e não tenta TTS. Falhas no serviço TTS emitem `TTS_UNAVAILABLE_TEXT_AVAILABLE`. O cliente de teste também verifica que cada resposta concluída recebeu ao menos um segmento de áudio.

Os serviços locais têm limite operacional de 500 pedidos diários nesta instalação. O orçamento estimado do STT é 50 milhões de unidades e o do TTS é 500 mil; a estimativa conservadora inclui o tamanho do áudio e não corresponde a cobrança do Google. Isso permite o ensaio de 100 turnos, inclusive segmentos TTS e áudio descartado. Os limites locais e remotos do Gemini permanecem separados.

## Estabilização da fase 1

A cota local de um LLM elegível pode direcionar o turno ao próximo provedor da cadeia; cada tentativa mantém sua política e seu orçamento contabilizado. Falhas de persistência não iniciam outra geração, e não há troca após entrega parcial de texto. O esgotamento de uma tentativa não significa que todos os provedores configurados estejam esgotados. Consulte `/v1/usage`; o aviso refere-se à operação e aos provedores elegíveis para sua classificação.

A interrupção automática preserva a resposta até o STT reconhecer palavras, em prévia ou transcrição final. A API faz uma consulta antecipada por vez, a partir de 800 ms durante resposta ativa; consultas obsoletas são canceladas e não substituem a transcrição final da frase completa. A confirmação manual de parada não comprova a meta de barge-in. O aceite exige 100 turnos e 30 interrupções automáticas no dispositivo real, mediana de resposta até 2 s e p95 de interrupção até 500 ms. As estimativas do navegador são auxiliares; latência física, ruído, AEC e consumo permanecem sujeitos ao ensaio.
