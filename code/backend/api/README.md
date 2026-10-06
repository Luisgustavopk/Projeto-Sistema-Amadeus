# API

## Memória híbrida e retomada — fase 3

O extrator independente utiliza seu orçamento completo, sem a reserva antiga de 20% para conversas. Nome declarado e correção de grafia no mesmo lote são considerados juntos. A recuperação de fatos usa embeddings multilíngues locais, sem listas de palavras em português ou expressões fixas para perguntas de identidade. A aprovação automática continua dependendo de extração válida e cota disponível.

Para provisionar a busca por significado em uma instalação nova, execute `npm run setup:memory-search` uma vez e reinicie a API. O comando baixa revisões fixadas do [BGE-M3](https://huggingface.co/Xenova/bge-m3) e do [Jina Reranker v2 multilingual](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual) para `data/models`. As inferências normais são estritamente locais, em CPU; o BGE usa um worker e o classificador um processo separado, ambos com dois threads de cálculo, isolando os runtimes nativos no Windows. Não há chamadas adicionais de LLM ou cobrança de API pela recuperação, mas há uso de disco, RAM e CPU. O Jina tem licença **CC-BY-NC-4.0**, para uso não comercial; consulte a licença antes de uso comercial. `MEMORY_SEMANTIC_ENABLED=false` desativa a busca semântica; `MEMORY_RERANK_ENABLED=false` desativa apenas a classificação adicional, inclusive seu download no provisionamento; `MEMORY_MODEL_CACHE_DIRECTORY` muda o cache. `npm run memory -- status` mostra `search` e `ranking`, com estado e erro; falha no classificador conserva a busca semântica, e falha no BGE conserva a busca lexical. As permissões e a aprovação dos fatos continuam valendo.

Os vetores são persistidos no SQLite pela migração `0008_memory_embeddings`; memórias existentes são indexadas automaticamente nas pausas, com até 16 novos vetores por rodada. A primeira recuperação também pode completar um lote. Depois, o texto de cada fato é reutilizado pelo índice; edição, revogação e esquecimento invalidam os derivados. A mesma busca seleciona `existingFacts` para o extrator reconhecer correções entre idiomas. A recuperação mantém os limites de contexto, os filtros de proprietário, confirmação, validade e classificação. Os checkpoints extrativos ainda usam busca lexical dentro da própria conversa.

O extrator LLM analisa até dois turnos novos por trabalho e pode sugerir até 24 fatos. O prompt em `src/application/memory/memory-extraction-v1.md` orienta a preservar detalhes e associações no texto recuperável; citar uma informação apenas na evidência não basta para lembrá-la depois. Predicados do grafo são rótulos livres validados, em qualquer idioma. A recuperação considera até duas falas anteriores e até 3.000 caracteres de fatos, mantendo os filtros de classificação e reprodução confirmada.

Fatos selecionados podem incluir `coMentioned`, índices que indicam quais foram extraídos da mesma fala. Isso preserva contexto complementar sem enviar a evidência original nem criar relações por inferência. `src/application/memory/memory-response-v1.md` orienta a resposta a usar detalhes sustentados, incluir complementos necessários e reconhecer informação indisponível; seu teto é de 2.000 caracteres e o build copia esse complemento junto dos outros Markdown.

`npm run eval:memory-retrieval` avalia os modelos locais em um banco fictício separado, sem LLM/STT/TTS nem consumo de cotas remotas, e salva resultados em `data/memory-evals`. Os resultados incluem perguntas sem informação correspondente: a busca pode selecionar algo apenas relacionado, o que não autoriza inventar uma resposta. O ensaio mede seleção de contexto, não qualidade de respostas da LLM. Detalhes e critérios na [arquitetura](../../../docs/architecture/Memoria_Fase_3.md).

A cota local contabiliza a reserva enquanto a operação está em andamento. Quando uma chamada concluída informa tokens de entrada e saída, passa a contar o consumo reportado; falhas e relatórios parciais conservam a estimativa. Tentativas falhas continuam contando como pedidos. Isso não muda planos, limites remotos, chaves ou as restrições a modelos gratuitos.

Durante a chamada, cota/indisponibilidade da LLM aciona as reservas elegíveis. O evento `reply.wait` acompanha uma fala curta, no máximo uma vez por turno. Edite `src/application/voice/provider-wait-presets.json` para alterar a primeira frase de `phrases` ou use `enabled: false` para desativar a fala. Reinicie a API após editar esse arquivo; o build leva uma cópia para `dist`. A fala passa pelo TTS normal, com a voz ativa, e participa da reprodução/interrupção. Se uma resposta falada já começou, há uma tentativa limitada de continuação com o trecho fornecido, sem iniciar outra resposta do zero. Todas as reservas sem cota ainda resultam em erro; nenhum orçamento ou plano pago é aumentado automaticamente.

Histórico, checkpoints extrativos, fatos revisáveis e relações entre entidades são persistidos no SQLite. O fluxo de voz recupera somente memória pertinente e autorizada. Por padrão, sugestões precisam de confirmação e fatos/resumos começam restritos ao local. A opção persistida `autoApprove` permite aprovar automaticamente novas extrações validadas. A arquitetura, limites, políticas, exclusão, backup e comandos estão em [Memoria_Fase_3.md](../../../docs/architecture/Memoria_Fase_3.md).

O padrão usa extração local, sem novas chamadas de LLM, e mantém memória pessoal e retenção automática desativadas. Depois de iniciar a API, `npm run memory -- status` consulta o estado. Para habilitar uso pessoal, escolha a retenção e reconheça o armazenamento local: `npm run memory -- configure --personal --extraction=local --retention-days=30 --acknowledge-local-storage`. Essa configuração aplica retenção também a dados existentes; o SQLite não tem criptografia própria. `memory -- facts`, `confirm`, `edit`, `forget` e `graph` permitem revisar e controlar os dados. Não marque conversa real como sintética.

Para interpretação semântica, o extrator usa configuração, modelo e orçamento próprios, sem recorrer às LLMs da conversa. O perfil provisório utiliza `openai/gpt-oss-20b` gratuito na Groq, com `GROQ_GPT_OSS_API_KEY` e política pessoal aprovada; a conversa conserva suas credenciais atuais. Configure a variável no `.env` e reinicie a API antes de aplicar o perfil. O isolamento remoto depende da organização à qual a chave pertence: outra chave da mesma organização não aumenta sua cota. A aplicação não verifica esse vínculo nem ativa planos pagos. Com a API iniciada:

```powershell
npm run memory -- configure-extractor --file=config/memory-extractor.groq.example.json
npm run memory -- configure --personal --extraction=llm --retention-days=30 --acknowledge-local-storage
npm run memory -- status
```

A extração ocorre em segundo plano, usando falas recentes e antecedentes. Ela pode processar grupos menores numa chamada aberta, quando não há turno em execução e a última entrada tem pelo menos 15 segundos. Um novo turno cancela a análise e tem prioridade. `memory -- review` também informa trabalhos pendentes por cota. Fatos, eventos temporários e correções mantêm evidências e passam por validação; no modo manual, sugestões exigem revisão; com `autoApprove`, a validação é seguida de aprovação automática. Eventos expiram; correções substituem o fato antigo somente após confirmação. Falhas do modelo adiam o processamento. `npm run eval:memory-semantic -- --run` consome uma chamada gratuita com exemplos fictícios e salva um relatório local; sem `--run`, apenas informa o plano. A [decisão sobre o extrator e Jev](../../../docs/decisions/Extrator_Memoria_e_Jev.md) registra os limites e os experimentos de refinamento após a fase 3.

Para testar lembrança em outra conversa, encerre a chamada e consulte `npm run memory -- facts`. Um fato `suggested` ainda não entra no contexto; um fato `local-only` não pode ser enviado à LLM remota. Depois de revisar a informação e autorizar seu uso remoto, execute `npm run memory -- confirm --id=ID_DO_FATO --permission=eligible`. A confirmação padrão conserva a permissão existente. Em seguida, inicie outra conversa pessoal e pergunte sobre o assunto. A busca deve recuperar somente fatos confirmados, pertinentes e autorizados. Quando não há memória recuperada, a direção da conversa pede que a persona diga que a informação não está disponível, sem negar que o aplicativo oferece memória persistente.

Use `npm run memory -- review` para revisar os fatos com explicação de estado e comandos já preenchidos com IDs e versões reais. `--json` oferece saída estruturada; `--help` explica o fluxo. `ID_DO_FATO` nos exemplos não deve ser copiado literalmente. A opção de confirmação local e a de autorização remota aparecem separadamente; a aprovação automática fica desativada por padrão.

Para dispensar confirmação por ID, execute `npm run memory -- auto-approve --on`. O comando conserva a extração, a retenção e a habilitação de dados pessoais. Fatos/eventos validados passam a `confirmed`; fatos e checkpoints pessoais/sintéticos recebem `eligible`, mantendo os filtros de classificação e de provedor. Correções com alvo válido substituem a memória anterior automaticamente. Dados `local-only` continuam locais. A opção não aprova retrospectivamente sugestões antigas nem amplia permissões de fatos já revisados. Consulte `npm run memory -- status`; `policy.autoApprove` mostra o estado. Para voltar à revisão manual das próximas extrações: `npm run memory -- auto-approve --off`. Memórias já aprovadas continuam disponíveis; `review`, `edit` e `forget` permitem controlá-las.

Para retirar só uma interpretação automática incorreta, preservando a fala e outros fatos dela, use `npm run memory -- reject-interpretation --id=UUID --version=N`. O registro sai da recuperação e o mesmo texto não será reextraído automaticamente. Isso exige revisão explícita; para esquecimento e bloqueio das fontes, use `forget`.

A migração `0006_memory_equivalence` normaliza sujeitos como `eu` e `usuário` e prepara um índice de equivalências conservadoras. Preferências simples com objeto e significado iguais, como “gosto de café sem açúcar” e “prefiro café sem açúcar”, podem compartilhar um fato e suas evidências. Condições, negações, terceiros, eventos e correções continuam distintos. `npm run memory -- consolidate` consolida registros antigos da mesma classificação, conserva a aprovação existente, junta fontes e informa quantos foram unidos ou preservados por conflitos de permissão/correção. Isso não é um detector universal de paráfrases; a interpretação livre da conversa continua a cargo da LLM.

`npm run eval:memory-integrated -- --run` executa extração, recuperação e respostas textuais reais em um SQLite sintético separado. Verifica revisão, correção, ficção, validade, esquecimento, reconstrução, retomada e reinício; contabiliza o consumo nos limites reais, sem mudar a configuração ou gravar fatos no banco de produção. Sem `--run`, mostra o plano. `--resume=data/memory-evals/ARQUIVO.json` retoma somente um ensaio que já chegou ao checkpoint após esquecimento, para concluir a resposta final sem repetir extrações. Os relatórios e bancos ficam ignorados pelo Git. Esse ensaio não mede voz nem qualidade geral da persona.

Como alternativa com cota separada da Groq, o adaptador `zai` aceita somente `glm-4.7-flash`, listado como gratuito; FlashX e modelos pagos são recusados. O perfil usa `ZAI_GLM_FLASH` no `.env`, JSON mode e validação local das evidências. Para avaliar antes de alterar o extrator ativo:

```powershell
npm run eval:memory-semantic -- --run --profile=config/memory-extractor.zai.example.json
```

`--profile` não modifica a configuração ativa nem grava fatos; a tentativa é contabilizada no orçamento do extrator para esse provedor. O relatório também registra falhas de acesso. Após validar o acesso e a qualidade, aplique com `npm run memory -- configure-extractor --file=config/memory-extractor.zai.example.json`. Reinicie a API após adicionar a chave ao `.env`. Não há reserva automática em outro provedor. Se a Z.ai retornar `1113`, a conta informa saldo ou pacote de recursos ausente; isso é uma recusa de configuração, não uma promessa de liberação após esperar. O Amadeus não compra créditos nem ativa planos. [Preços Z.ai](https://docs.z.ai/guides/overview/pricing), [erros](https://docs.z.ai/api-reference/api-code), [política da API](https://docs.z.ai/legal-agreement/privacy-policy#data-processing-addendum-for-api-services).

`npm run backup:memory` cria snapshot consistente do SQLite em `data/backups/`; arquivos de voz e `.env` são preservados separadamente. `npm run eval:memory` mede recuperação local com 1.002 fatos fictícios, sem APIs remotas. `session.resume` aceita ticket novo para a mesma conversa e restaura contexto sem replay de áudio; o SDK expõe `resumeState()` e o cliente de teste retoma após queda ao clicar em Conectar na mesma página.

## Configuração da persona e versões vocais — fase 2

`GET /v1/persona` retorna a direção administrativa, versão base e revisão. `PUT /v1/persona` recebe `{"expectedRevision":0,"direction":"Prefira explicações com exemplos curtos."}`. O limite é 2.000 caracteres; tags técnicas são recusadas. Uma edição concorrente/desatualizada recebe 409. A configuração é persistida por proprietário e vale no próximo turno sem reiniciar nem reconectar; um turno já iniciado e sua recuperação conservam a mesma revisão. Direção vazia remove o complemento administrativo. O prompt estruturado, documento, skill e contrato técnico permanecem presentes.

`POST /v1/voice/versions` recebe `{"name":"Voz aprovada"}` e registra clone/referência/hash, modelo, configuração TTS, formato PCM, accent, segmentação e presets artísticos, sem valores de credenciais. `GET /v1/voice/versions` lista até 256 versões preservadas. `POST /v1/voice/versions/:id/restore` restaura somente o TTS, preservando LLM/STT. Uma voz local exige reativar sua referência original antes da restauração; a operação respeita o bloqueio de configuração. As versões registram o contrato da API; configurações internas de um serviço local externo e pesos não são reinstalados por esse endpoint.

Persona 0.4.13: a direção principal está em `backend/assets/persona/conversation-directions-v1.md`, carregada diretamente no prompt normal e na recuperação. Reações são orientadas por gatilhos, sem frases prontas nessa direção; correção científica, identidade ficcional, memória da sessão e formato recebem ajustes após o reteste. O código mantém montagem e contrato expressivo. Limite do arquivo: 5.000 caracteres; orçamento do prompt normal completo: 20.000, com rejeição sem truncamento; versão atual: 19.146 caracteres. Reinicie a API após editar Markdown; para `dist`, gere novo build. A skill completa e as fontes originais permanecem preservadas. O histórico confirmado continua limitado a 3.000 caracteres. `npm run eval:persona -- --refinement` valida a rodada curta de oito regressões e quatro situações novas; `--run` consulta o modelo configurado e consome cota. Isso não substitui os 30 casos, continuidade ou revisão humana. [Decisão de avançar para a fase 3 e experimentar técnicas avançadas depois](../../../docs/decisions/Decisao_Persona_Fase_3.md).

A redução anterior da 0.4.10 resolveu o 413 observado no Groq; cotas continuam valendo. `npm run eval:persona -- --run --interval-ms=60000` espaça os cenários por um minuto sem alterar limites ou faturamento.

O usuário aprovou a qualidade vocal atual em 05/10/2026. O gate aceita `voiceAcceptance` com `source: "user"`, `approved: true`, `approvedAt` e `reason`, sem exigir notas vocais inventadas; isso não dispensa a revisão textual. Foram coletados 30 cenários no Cloudflare na 0.4.9 e encontrados problemas de resposta ao pedido atual. A 0.4.10 reforça esses comportamentos, mas seu reteste completo permanece pendente por cotas/disponibilidade. A correção do streaming Cloudflare aceita fragmentos numéricos como texto, evitando a falsa classificação de indisponibilidade temporária.

## Provedores LLM e reservas

O LLM pode usar Gemini, Groq ou Cloudflare Workers AI. Groq e Cloudflare usam endpoints oficiais compatíveis com Chat Completions e suportam entrega SSE. Configure suas chaves somente no ambiente da API (`GEMINI_API_KEY`, `GROQ_API_KEY` e `CLOUDFLARE_AI_TOKEN`); nunca envie valores de segredo no JSON da configuração. Para privilegiar baixa latência, esta instalação local usa Groq como principal, Cloudflare como primeira reserva e Gemini por último. Um smoke test sintético isolado mediu o primeiro texto em 303 ms no Groq e 398 ms no Cloudflare, enquanto o Gemini estava sem cota. Esses valores não representam a conversa completa nem garantem desempenho futuro.

O Groq também pode responder HTTP 413 quando o prompt excede o limite de tokens por minuto da conta. Quando o corpo identifica `error.code: "rate_limit_exceeded"` e `error.type: "tokens"`, a API classifica como `QUOTA_EXCEEDED` e permite a mesma cadeia de reservas. Outros erros 413 são tratados como configuração/entrada recusada. A mensagem remota não é exposta. O prompt completo com documento e skill pode exceder o limite do modelo principal mesmo sem histórico; nesse caso, a geração depende de uma reserva elegível e disponível.

No streaming, uma falha temporária do último provedor elegível permite uma única nova tentativa no mesmo provedor, após 400 ms e antes de qualquer fragmento entregue. Ela recebe nova reserva de uso e respeita cancelamento, política de dados e orçamento. Cota, erro de configuração, falha de persistência e conteúdo parcial não permitem essa repetição. Se a segunda tentativa também falhar, o erro é reportado; disponibilidade externa não é garantida.

`llm.fallbackProviders` aceita até oito provedores alternativos ordenados. Exemplo parcial para mesclar à configuração atual:

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

## Provedores cloud de fala

STT aceita Deepgram `nova-2` ou `nova-3`; TTS aceita Cartesia `sonic-3.6` com um `voiceId` existente. Configure `DEEPGRAM_API_KEY` e `CARTESIA_API_KEY` somente no ambiente da API. Ao configurar `stt` ou `tts` em `PUT /v1/providers`, defina o provedor primário, `apiKeyEnv` e `dataPolicy`. `personal-approved` exige `policyReviewedAt` e `policyReference`: antes de habilitar, revise e aprove os termos e o tratamento de áudio/transcrições pela Deepgram e de texto/voz pela Cartesia. Não marque essa aprovação sem fazer a revisão.

Para manter o fallback local, configure `speechFallback` no papel correspondente com `adapter: "http-json"`, o endpoint local e `dataPolicy: "local-approved"`. Nesta instalação, os endpoints são `http://127.0.0.1:8001` para STT e `http://127.0.0.1:8002` para TTS; os serviços usam `STT_SERVICE_TOKEN` e `TTS_SERVICE_TOKEN` no ambiente da API. Exemplo parcial de configuração (mescle aos demais provedores; não substitua `llm`):

```json
{
  "stt": {
    "adapter": "deepgram",
    "model": "nova-3",
    "apiKeyEnv": "DEEPGRAM_API_KEY",
    "dataPolicy": "personal-approved",
    "policyReviewedAt": "<data-hora-ISO-8601-da-revisao>",
    "policyReference": "https://deepgram.com/terms",
    "speechFallback": {
      "adapter": "http-json",
      "endpoint": "http://127.0.0.1:8001",
      "apiKeyEnv": "STT_SERVICE_TOKEN",
      "dataPolicy": "local-approved"
    }
  },
  "tts": {
    "adapter": "cartesia",
    "model": "sonic-3.6",
    "voiceId": "<UUID-da-voz-Cartesia>",
    "apiKeyEnv": "CARTESIA_API_KEY",
    "dataPolicy": "personal-approved",
    "policyReviewedAt": "<data-hora-ISO-8601-da-revisao>",
    "policyReference": "https://www.cartesia.ai/legal/dpa",
    "speechFallback": {
      "adapter": "http-json",
      "endpoint": "http://127.0.0.1:8002",
      "apiKeyEnv": "TTS_SERVICE_TOKEN",
      "dataPolicy": "local-approved"
    }
  }
}
```

Pré-visualizações frequentes de STT permanecem locais; apenas a transcrição final pode ser enviada ao provedor remoto conforme a política aprovada. Falhas temporárias ou de cota podem usar o fallback local; erros de autenticação, configuração ou entrada são reportados sem mascaramento. O fallback local só pode receber conteúdo classificado `local-only` quando sua política está configurada como `local-approved`.

## Conversa e diagnóstico de voz

`llm.thinkingLevel` configura o raciocínio do Gemini (`low`, `medium`, `high`) quando Gemini está ativo; outros provedores ignoram essa opção. A resposta falada é orientada a uma ou duas frases por padrão. Respostas de até 220 caracteres são reunidas em uma síntese, preservando pontos, perguntas e exclamações como pausas naturais. Respostas maiores continuam em blocos de até 220 caracteres, preferindo a última frase completa dentro do limite, depois uma pausa ou fronteira de palavra. Isso reduz reinícios da voz entre frases curtas; pode aumentar o tempo até o primeiro áudio por aguardar o restante da resposta curta. Continuidade e latência devem ser avaliadas por escuta.

O STT retorna `NO_SPEECH_DETECTED` para áudio válido sem fala. A captura candidata é descartada e a resposta anterior, se houver, continua; esse caso contabiliza `noSpeech` e não é tratado como indisponibilidade. Erros reais de validação continuam visíveis. O serviço local enfileira até uma inferência enquanto outra está ocupada; HTTP 429 indica fila cheia e 400 entrada recusada. No cliente, o VAD exige 160 ms acima do limiar e preserva 160 ms anteriores à fala, mas não interrompe por si só: durante a captura e a transcrição STT, a resposta atual continua. Ela só é interrompida após `transcript.partial` com palavras durante a captura ou `transcript.final` não vazio; a interrupção manual permanece imediata.

Cada usuário tem uma única chamada de voz ativa. Abrir outra chamada válida substitui a anterior, interrompe seus trabalhos e fecha o socket anterior com 4001. Isso evita duas abas transcrevendo o mesmo microfone e reproduzindo respostas sobrepostas. Geração concluída e fim da reprodução são acompanhados separadamente: ambas precisam terminar para voltar a `idle`. Falhas não deixam um turno ativo sem execução.

Se não houver perfil de voz ativo, a resposta textual ainda pode ser gerada, mas a API emite `VOICE_NOT_READY` e não tenta TTS. Falhas no serviço TTS emitem `TTS_UNAVAILABLE_TEXT_AVAILABLE`. O cliente de teste também verifica que cada resposta concluída recebeu ao menos um segmento de áudio.

Os serviços locais têm limite operacional de 500 pedidos diários nesta instalação. O orçamento estimado do STT é 50 milhões de unidades e o do TTS é 500 mil; a estimativa conservadora inclui o tamanho do áudio e não corresponde a cobrança do Google. Isso permite o ensaio de 100 turnos, inclusive segmentos TTS e áudio descartado. Os limites locais e remotos do Gemini permanecem separados.

## Persona e atuação — fase 2

A persona versionada usa a análise fornecida pelo usuário e o recorte aprovado anterior à viagem de Kurisu ao Japão. Curiosidade, humor contextual, cuidado e limites de identidade são dirigidos por `../assets/persona/conversation-directions-v1.md`, montado com os complementos por `src/application/persona/prompt.ts`; regras e vocabulário expressivos ficam em `src/domain/persona`. A biografia ficcional é separada do histórico confirmado e de fatos pessoais. Não há memória persistente da fase 3.

O documento original completo está preservado em `../assets/persona/source-v0.4.md`. A versão 0.4.7 inclui diretamente suas seções 3.12, 5.2–5.6 e 14.5 como referência complementar, mantendo prioridade das regras estruturadas. O conteúdo é lido ao iniciar e também incluído na recuperação em fala simples; alterações no Markdown exigem reinício. O build leva uma cópia integral do documento para `dist/application/persona/`. Consulte `../assets/persona/README.md` para limites e organização.

A versão 0.4.8 incorpora `src/application/persona/skill-amadeus-kurisu.md` diretamente no prompt. As pendências foram aprovadas e têm critérios de execução na seção 13 da skill: ficção explícita, meta-consciência, familiaridade, limites de voz, `ceder_turno`, cuidado em crise e medições acústicas sem classificação emocional. O limite de prompt passa a 32768 caracteres para preservar o prompt estruturado e os dois complementos. Consumo e latência incluem esse contexto maior. Execute `npm run eval:persona -- --skill --run --limit=12` para avaliação textual e `npm run check:skill-voice` para preparar a escuta dos quatro presets; a escuta humana continua necessária.

O LLM propõe expressão na mesma geração de fala. O prefixo é removido antes do TTS; intensidade e transições são validadas por chamada. `reply.expression` acompanha os IDs do segmento e informa versão, intenção, emoção, preset e `deliveryApplied: false`. Os presets são direção artística: não alteram parâmetros de voz nativos não validados. `GET /v1/voice/protocol` publica a versão da persona e a associação para clientes futuros; vincule a expressão à reprodução efetiva do segmento, não ao instante em que o evento chega.

Ferramentas: `npm run eval:persona` valida os 30 cenários; acrescente `-- --run --limit=30` para coletar respostas sintéticas com cota normal. `npm run check:persona-voice` cria três WAVs com o perfil ativo para ouvir continuidade. `npm run review:persona -- <relatório.json>` calcula o aceite a partir das notas humanas. Consulte [instruções e resultados](../evals/persona/README.md). Falhas de cota/disponibilidade e revisão humana pendente impedem declarar o aceite completo.

## Estabilização da fase 1

A cota local de um LLM elegível pode direcionar o turno ao próximo provedor da cadeia; cada tentativa mantém sua política e seu orçamento contabilizado. Falhas de persistência não iniciam outra geração, e não há troca após entrega parcial de texto. O esgotamento de uma tentativa não significa que todos os provedores configurados estejam esgotados. Consulte `/v1/usage`; o aviso refere-se à operação e aos provedores elegíveis para sua classificação.

A interrupção automática preserva a resposta até o STT reconhecer palavras, em prévia ou transcrição final. A API faz uma consulta antecipada por vez, a partir de 800 ms durante resposta ativa; consultas obsoletas são canceladas e não substituem a transcrição final da frase completa. A confirmação manual de parada não comprova a meta de barge-in. O aceite exige 100 turnos e 30 interrupções automáticas no dispositivo real, mediana de resposta até 2 s e p95 de interrupção até 500 ms. As estimativas do navegador são auxiliares; latência física, ruído, AEC e consumo permanecem sujeitos ao ensaio.

## Experimento híbrido local + nuvem

A branch `experiment/local-llm-stt` mantém a cadeia atual da nuvem e permite adicionar `llm.localProvider`. O adaptador `openai-local` aceita somente HTTP de loopback em `/v1/chat/completions`, conserva a mensagem de sistema e usa streaming SSE. A opção é restrita ao LLM; STT/TTS não mudam de contrato.

O roteamento usa uma lista conservadora de conversas conhecidas. Saudações, pequenas histórias e algumas reações pessoais podem ir ao local; termos técnicos, pedidos longos e entradas não classificadas seguem a cadeia remota. Isso não é um detector universal de dificuldade. `local-only` usa exclusivamente o candidato local, inclusive em pedidos complexos. Uma falha local anterior ao primeiro fragmento pode usar reserva elegível; depois de começar a resposta, não gera uma segunda resposta por outro modelo. Cotas, reservas e classificação de dados continuam aplicadas. `/v1/capabilities` informa o candidato local; `/v1/usage` identifica seu consumo com `isLocal`.

### Runtime e avaliação independente

Na raiz do repositório, preparar os arquivos oficiais e verificados por SHA256:

```powershell
code/backend/services/stt/.venv/Scripts/python.exe code/backend/tools/local-llm/setup.py
.\code\backend\tools\local-llm\start.ps1
```

O runtime portátil llama.cpp `b11146` executa Qwen3-1.7B Q8_0 em CPU, quatro threads, contexto de 8.192 tokens, uma requisição por vez e raciocínio explícito desativado. Escuta somente `127.0.0.1:8003`, com credencial separada, sem UI. Downloads e credencial ficam em `.cache/`, ignorada pelo Git. Não altera a instalação do sistema nem ocupa a GPU. Modelo oficial: [Qwen3-1.7B-GGUF](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF); runtime: [llama.cpp](https://github.com/ggml-org/llama.cpp/releases/tag/b11146).

Na pasta `api`, avaliar sem trocar os provedores de produção:

```powershell
npm run eval:persona -- --local --dialogue --run --limit=4
```

### Ativação opcional e reversão

O candidato não foi ativado como padrão. Para experimentar com a interface:

```powershell
npm run setup:hybrid -- --prepare
# Reinicie a API para carregar LOCAL_LLM_API_KEY.
npm run setup:hybrid -- --apply
```

Encerre a chamada antes de aplicar configuração. O comando sem flags apenas mostra o plano. Para voltar à cadeia anterior:

```powershell
npm run setup:hybrid -- --disable --apply
```

A alteração usa a API autenticada e seu bloqueio normal de configuração. A preparação grava apenas a credencial local no `.env`; não troca chaves da nuvem. Backups ficam em `api/data/hybrid/`.

### Resultado observado e limites

Com i5-12400F, 16 GB de RAM e os serviços de voz ativos, o primeiro trecho de fala local levou 36,82 s no primeiro caso e 3,80–4,81 s nos três seguintes. São tempos do LLM, sem STT, TTS ou áudio físico. D02/D03 copiaram exemplos da persona, e D01 inventou sentido para uma fala incompreensível: personalidade e naturalidade não estão aprovadas. Uma ativação temporária pela API respondeu uma saudação em 4,44 s até o primeiro trecho e foi revertida, com igualdade da configuração anterior verificada. Não satisfaz a meta de conversa de 2 s.

Relatórios locais: `api/data/persona-evals/1791126180265-persona.json` e `api/data/hybrid/integration-smoke.json`. O modelo não recebeu fine-tuning; a direção atual vem do prompt. Treinamento exigirá exemplos curados, revisão e avaliação separada, e não substitui STT/TTS nem memória controlável.

## Comparação isolada da persona

`npm run compare:persona` valida o plano sem chamar provedores. O conjunto versionado `../evals/persona/behavior-v1.json` contém as 12 conversas de três turnos propostas pelo usuário. Para uma triagem com as mesmas perguntas:

```powershell
npm run compare:persona -- --run --cases=U01,U05,U10
npm run compare:persona -- --run --compact --cases=U01,U05,U10
```

Os candidatos são GPT-OSS 120B e 20B no Groq; `--models=qwen/qwen3.8-27b` inclui o controle atual. `--speech-only` compara a fala sem solicitar cabeçalho. Sem `--cases`, são executados os 36 turnos de cada modelo. Cada conversa encadeia as próprias respostas, sem reutilizar respostas de outro candidato. A variante compacta mantém identidade, recorte e referência curada e permanece experimental: não substitui o prompt de produção.

O ensaio usa a credencial Groq configurada, dados sintéticos, reservas e limites normais. Não salva novos provedores, não ativa planos nem aumenta orçamento. Esperas limitadas respeitam `retry-after`; esgotamento diário/local interrompe a coleta desse modelo. Relatórios em `data/persona-evals/comparison` registram prompt, modelo, respostas brutas, recuperação, erros e tempos, com aceite humano pendente. Não representam latência do microfone ao áudio. Cotas por provedor continuam se aplicando mesmo quando a reserva local foi aceita.

Na chamada, execuções sucessivas da mesma sessão aguardam o cancelamento e a persistência anteriores antes de gerar novamente. Consultas antecipadas do STT não se acumulam entre capturas canceladas. No serviço Python, cancelamentos repetidos não liberam o bloqueio enquanto a thread de inferência estiver em execução. A interrupção automática permanece condicionada ao reconhecimento de palavras.

## Qualidade da saída Cartesia

Cartesia usa PCM16 mono de 24 kHz e `accent: "brazilian-portuguese"`, como a comparação isolada. A API preserva a taxa em `audio.segment` até o player, sem reduzir para 16 kHz. Os fallbacks locais e a captura/STT continuam em 16 kHz. Reinicie a API e recarregue a página de chamada para usar o contrato de saída atualizado. A equivalência de parâmetros não substitui a avaliação auditiva de prosódia e continuidade entre frases.

## Reserva de LLMs: Mistral e OpenRouter

Os adaptadores `mistral` e `openrouter` usam Chat Completions com streaming,
preservando o prompt da persona. `fallbackProviders` aceita até oito reservas,
percorridas na ordem configurada, somente antes da entrega da resposta. Falhas
de autenticação e parâmetros continuam sendo reportadas como configuração inválida.

Para ativar na instalação existente:

1. Crie uma chave em [OpenRouter](https://openrouter.ai/settings/keys). O campo
   `Credit limit` limita o gasto autorizado pela chave; não é uma compra de créditos.
   `No limit` remove esse teto, mas não remove as cotas dos modelos gratuitos.
   O Amadeus restringe esse adaptador a modelos `:free` e preço máximo zero.
   Não é necessário comprar créditos para começar a usar esses modelos.
   A Mistral é opcional: use-a somente se sua conta permitir criar uma chave sem
   pagamento. Embora a documentação descreva acesso gratuito, a conta do usuário
   exibiu bloqueio de chaves no plano Free e exigência de upgrade. Nesse caso,
   deixe `MISTRAL_API_KEY` ausente e prossiga somente com OpenRouter.
2. Adicione ao `.env` da API, sem aspas e sem enviar as chaves ao Git:

   ```dotenv
   MISTRAL_API_KEY=sua_chave
   OPENROUTER_API_KEY=sua_chave
   ```

3. Reinicie a API com `npm run dev` para carregar as variáveis novas. Em outro
   terminal, na mesma pasta `code/backend/api`, confira a proposta:

   ```powershell
   npm run setup:llm-reserve
   ```

4. Após revisar e aprovar as políticas de dados da
   [Mistral](https://mistral.ai/terms) e do
   [OpenRouter](https://openrouter.ai/privacy), ative para conversas pessoais:

   ```powershell
   npm run setup:llm-reserve -- --personal --apply
   ```

   Sem `--personal`, os novos provedores ficam `synthetic-only` e não participam
   das conversas pessoais. OpenRouter envia `data_collection: deny`, que pode
   reduzir a disponibilidade de endpoints gratuitos.

O comando mantém o principal atual, STT, TTS e as reservas anteriores. Insere
Mistral Small, Qwen3.8 27B Free, Nemotron 3.5 Lightning Free e Nemotron 3 Super Free
antes das reservas antigas, usando somente os provedores com chave no ambiente.
Salva uma cópia da configuração anterior em `data/llm-reserve/`. Se uma LLM local
já estiver configurada, passa a usá-la por último com `localRouting: cloud-first`.
Não instala nem ativa um runtime local novo. O modo híbrido anterior continua
disponível com `localRouting: hybrid`.

OpenRouter exige um modelo explícito terminado em `:free`; os routers aleatórios
e os modelos pagos são recusados. Cada pedido também limita os preços de entrada
e saída a zero. O instalador define um orçamento local conservador de 50 pedidos
por dia UTC, **compartilhado entre os modelos que usam a mesma variável de chave**.
Pedidos que falham também contam. Em `/v1/usage`, esses modelos exibem a mesma
contagem agregada; não some suas linhas. Esse orçamento não mede a cota restante
real do provedor, nem outras aplicações usando a conta.

Erros de cota e indisponibilidade temporária colocam o modelo em pausa entre
turnos, compartilhada por execução comum e streaming. `Retry-After` é respeitado;
sem esse cabeçalho, a pausa é de 60 segundos para cota e 15 segundos para falha
temporária. Limites confirmados da conta OpenRouter (402 ou 429 com cabeçalhos
`X-RateLimit-*`) pausam os modelos dessa credencial em conjunto. Um 429 sem esses
cabeçalhos pausa somente o modelo, permitindo tentar a próxima reserva gratuita.
As pausas ficam em memória e são apagadas ao reiniciar a API; a contagem
de orçamento permanece no SQLite. Falhas após texto entregue nunca iniciam uma
segunda geração. A API não retoma automaticamente uma fala que já falhou.

Para verificar os novos modelos com um cenário sintético por vez:

```powershell
npm run eval:persona -- --run --limit=1 --model=mistral-small-latest
npm run eval:persona -- --run --limit=1 --model=qwen/qwen3.8-27b:free
```

Esses comandos consomem cota e salvam relatórios locais. A integração não implica
aprovação da qualidade da persona: compare as respostas e a latência antes de
alterar a prioridade. Para remover as novas reservas, use
`npm run setup:llm-reserve -- --disable --apply`; o comando preserva a configuração
local atual. Os limites e o catálogo dos provedores podem mudar:
[Mistral](https://docs.mistral.ai/admin/billing-usage/usage-limits),
[OpenRouter](https://openrouter.ai/docs/api-reference/limits).
