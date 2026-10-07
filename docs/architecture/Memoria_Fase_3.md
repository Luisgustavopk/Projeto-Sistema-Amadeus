# Fase 3: memória híbrida e retomada

Atualização do refinamento após o Voice Test em 06/10/2026: o fluxo vocal deixou de planejar toda resposta com o extrator remoto. A LLM declara os fatos persistentes utilizados no cabeçalho técnico; conversa comum segue diretamente à síntese, enquanto lembranças passam pela conferência factual Jev por bloco e revalidação local. O extrator independente continua cuidando de novos registros em segundo plano. As seções sobre planejamento abaixo preservam a implementação anterior e as APIs de avaliação. [Correção, arquitetura atual e medições](Refinamento_Llama_Jev.md#otimização-do-fluxo-vocal--persona-0415).

Arquitetura aprovada pelo usuário em 05/10/2026. Implementação: SQLite local, fatos revisáveis, resumos extrativos, grafo leve e recuperação seletiva. A melhoria posterior autorizada nesta data acrescenta embeddings multilíngues locais para recuperar fatos por significado. LangGraph e banco de grafos separado não são dependências desta fase. Treinamento e associações por reforço continuam reservados ao refinamento.

## O que muda na conversa

A API passa a fornecer à LLM fatos confirmados pertinentes ao turno, inclusive fatos de outras conversas. O histórico recente continua limitado e separado. Uma conversa longa também pode recuperar excertos de checkpoints da própria conversa. Guardar dados não altera pesos da LLM e não significa enviar o banco inteiro ao provedor.

```mermaid
flowchart TD
    A[Fala ou texto] --> B[Histórico persistido]
    A --> C[Recuperação local por assunto]
    F[Fatos confirmados e relações] --> C
    S[Checkpoints permitidos] --> C
    C --> V[Plano factual com referências a fatos]
    V --> P[Persona + histórico recente + memória selecionada]
    P --> L[LLM aprovada para a classificação]
    L --> X[Conferência da resposta com memória]
    X --> T[TTS e reprodução]
    X --> W[Reconhece que não conseguiu conferir]
    W --> T
    T --> R[Confirmação de reprodução no histórico]
    B --> J[Fila persistente de memória]
    R --> J
    J --> E[Rascunho extraído das falas]
    E --> G[Revisão semântica das fontes]
    G --> D[Reconciliação com memórias anteriores]
    D --> U[Revisão manual ou aprovação automática habilitada]
    U --> F
```

A memória integra o pipeline existente, inclusive a recuperação de resposta falável. Voz, clone, STT, presets e personalidade 0.4.13 são preservados. A LLM não recebe ferramentas para alterar a memória durante a geração; confirmação, edição e esquecimento são operações reais da API/CLI. O contexto instrui a personagem a não afirmar que uma alteração aconteceu sem confirmação da API.

## Revisão semântica e plano factual — 06/10/2026

A extração por LLM agora separa três operações. `extract` produz um rascunho a partir das falas atuais e dos antecedentes, sem ver memórias anteriores. `review` volta às mesmas fontes para avaliar o significado integral do texto e da relação, corrigir qualificadores perdidos e classificar suporte, preservação de contexto e natureza da declaração. As citações do rascunho não são fornecidas ao revisor: ele deve copiá-las das falas originais. O código só aceita resultados com `support: full`, `contextPreserved: true` e `sourceMode: asserted`, e revalida contrato, autoria das fontes, citações literais e evidência atual. Hipóteses, ficção, ambiguidade, perda de qualificadores e suporte parcial ficam fora da aprovação automática. Esses campos são julgamentos do modelo, não classificações infalíveis.

Somente depois dessa revisão, `reconcile` recebe as novas afirmações e memórias anteriores selecionadas. Essa etapa pode indicar duplicação ou alvo/versão de correção, mas não pode reescrever o conteúdo revisto. O código rejeita IDs, versões e índices inválidos e ligações conflitantes. A gravação continua transacional, com as permissões, retenção e proteção contra resultados de uma política antiga. Falha de qualquer etapa adia o lote; o rascunho não é aprovado parcialmente. O extrator local legado conserva seu comportamento; essas novas etapas se aplicam ao modo `llm`.

Os três prompts ficam em arquivos Markdown separados (`memory-extraction-v1.md`, `memory-review-v1.md`, `memory-reconcile-v1.md`). Extração e revisão são chamadas separadas, mas usam o mesmo extrator configurado. Isso é uma avaliação semântica por modelo, sujeita a erros correlacionados, não uma prova lógica ou verificador infalível. O contrato estruturado e a citação literal continuam necessários, sem serem tratados como comprovação do significado.

O revisor também fornece `context`, um campo de texto livre para domínio, condição, tempo e qualificadores da declaração. Esse conteúdo é incorporado ao texto armazenado e indexado, em vez de ficar somente na evidência local. O vocabulário é fornecido pelo modelo, sem dicionário de assuntos ou regras por idioma. O contrato valida tamanho e formato, enquanto `support` e `contextPreserved` continuam sendo julgamentos semânticos do modelo. Fatos antigos não são reclassificados automaticamente ao atualizar o código.

Na conversa, a recuperação por BGE-M3/Jina e o grafo permanecem locais. Quando há fatos selecionados, uma operação `answer` prepara afirmações pertinentes com referências aos IDs desses fatos e indica `answerable`, `unknown` ou `unrelated`. O código verifica versão, permissão e validade antes de enviar o recorte ao planejador, e verifica novamente os fatos usados depois da inferência. Resumos e transcrições originais não são enviados nessa etapa. O modelo principal recebe esse plano separado da personalidade, para preservar nomes, qualificadores e limites do que se sabe.

O planejamento acrescenta até uma chamada do extrator por turno com memória selecionada, com limite de oito segundos. Tempo de planejamento aparece em `memoryPlan` nas métricas de voz. Em indisponibilidade, a geração recebe uma orientação para responder à fala atual normalmente e reconhecer quando não conseguiu conferir uma lembrança; o extrator aguarda sessenta segundos antes de tentar planejar novamente.

Um plano factual não impede o modelo principal de acrescentar conteúdo sem suporte. Por isso, nos turnos com plano que não seja `unrelated`, a fala é retida antes de qualquer `reply.text` ou TTS e a operação `verify-answer` avalia a resposta inteira, com o mesmo recorte permitido. Há nova conferência de versões e permissões antes e depois dessa chamada. `supported`/`unrelated` liberam a fala; `unsupported`, `uncertain`, contrato inválido e indisponibilidade produzem uma frase neutra pedindo que o usuário relembre o detalhe. A proposta não conferida não entra no texto falado nem no histórico de resposta entregue. A exceção é a fala de espera de troca de provedor, que usa presets sem afirmações pessoais.

A conferência tem limite de oito segundos e retém até 6.000 caracteres; o tempo aparece em `memoryReplyCheck`, e recusas em `MEMORY_REPLY_UNVERIFIED`. Isso aumenta a latência e suspende a entrega progressiva nesses turnos. Perguntas classificadas como `unrelated`, turnos sem memória e o modo local legado conservam o fluxo anterior. A classificação por LLM pode errar tanto na liberação quanto no bloqueio; não substitui avaliação semântica independente. Falta de resposta útil deve ser contabilizada como falha de recuperação/resposta, mesmo que uma invenção tenha sido bloqueada.

A revisão e reconciliação ficam em segundo plano, interrompíveis pela conversa, e usam duas ou três chamadas por lote. O plano factual ocorre antes da geração da fala e pode acrescentar latência. Todos os pedidos usam a configuração, a chave, a política de dados, o bloqueio de modelos pagos e a contabilização real do extrator separado. Não há aumento permanente de limites nesta mudança.

`scripts/eval-memory-reviewed.mjs --run` testa extração, recuperação e respostas pela aplicação em SQLite isolado, consumindo as cotas reais. O roteiro sintético inclui português e inglês, qualificadores, ausência de ranking, mudança de preferência, tempo futuro, nomes e ficção. `--resume=...` retoma o checkpoint sem repetir extrações concluídas. Relatórios em `data/memory-evals/` e roteiros pessoais em `data/personal-evals/` ficam fora do Git. Os ensaios são textuais, sem STT, TTS, ACK de áudio simulado ou medição de reprodução. Um resultado de schema ou cobertura lexical não conta como aprovação semântica.

As instruções de revisão, planejamento, conferência da fala e formulação pela persona são Markdown separado, incluindo `memory-answer-direction-v1.md` e `memory-speech-review-v1.md`, copiados para o build. O código contém os contratos e as decisões de liberação, não um catálogo de frases ou assuntos reconhecíveis.

Verificação desta rodada: 401 testes automatizados, formatação, lint, tipos e build passaram. Os ensaios remotos intermediários confirmaram casos de português/inglês e também registraram falhas: perda de qualificadores, narrativa fictícia retida, ranking acrescentado e afirmação indevida de que algo não foi mencionado. Isso motivou os novos controles. A avaliação final ampliada não foi concluída: o principal atingiu cota remota, as reservas gratuitas foram recusadas sob a política de dados vigente, e a última revisão de contexto recebeu erro de provedor. Nenhuma dessas tentativas conta como aprovação semântica. Os limites temporários de teste foram restaurados para 200 mil tokens e 50 pedidos/dia, mantendo o extrator gratuito. A Fase 3 ainda precisa da revalidação semântica final; os testes automatizados não bastam para encerrá-la.

## Aprovação automática opcional

Em 05/10/2026, o usuário autorizou uma opção para dispensar a aprovação individual das memórias. `memory_policy.auto_approve` persiste essa escolha por proprietário; a API a expõe como `autoApprove`. A migração `0007_memory_auto_approval` mantém a opção desativada em bancos existentes. A ativação desta instalação foi solicitada pelo usuário.

```powershell
npm run memory -- auto-approve --on
npm run memory -- status
# Retornar à revisão manual das próximas extrações:
npm run memory -- auto-approve --off
```

O comando altera somente a opção, conserva os demais campos e exige a revisão atual da política. `PUT /v1/memory/policy` aceita `autoApprove: true/false`; clientes antigos que omitem o campo conservam a escolha vigente. A mudança cancela extrações em andamento e invalida resultados iniciados na política anterior, permitindo reprocessamento com a opção atual.

Quando ativa, todas as memórias válidas das próximas extrações, locais ou por LLM, passam a `confirmed` sem confirmação por ID. Fatos duradouros, acontecimentos com validade e correções com alvo/versão elegíveis seguem o mesmo fluxo. A aprovação e a substituição ocorrem na transação que salva as evidências. A origem continua `local-extraction`/`llm-extraction`, inclusive nas correções, para que exclusão de fontes e reconstrução preservem a rastreabilidade.

Memórias e checkpoints pessoais/sintéticos recebem `eligible`; a recuperação continua limitada ao assunto, à classificação e à política aprovada de cada provedor. `local-only` conserva a restrição local. A opção mantém a seleção do extrator, as instruções para distinguir hipóteses/ficção e as validações de schema/citações; cada fala não vira automaticamente um fato. Habilitação pessoal, retenção, cotas, expiração, esquecimento e bloqueios de fontes continuam aplicados.

Ligar a opção não promove retrospectivamente todas as sugestões existentes. Uma sugestão derivada pode ser aprovada se reencontrada em nova extração validada; permissões de fatos já revisados manualmente são preservadas. Desligar volta à revisão manual das novas extrações, sem revogar as aprovações anteriores. `review`, `edit` e `forget` continuam disponíveis para corrigir ou remover memórias.

Verificação desta alteração: 330 testes da API passaram, além de formatação, lint, tipos e build. Os novos testes cobrem ativação/desativação, preservação dos demais campos, atualização de banco legado, recuperação entre conversas, isolamento pessoal/local, evidência inválida, correções automáticas e esquecimento/reconstrução. A API local confirmou `autoApprove: true` na revisão 3, com extração por LLM, memória pessoal e retenção de 30 dias; o extrator continua Groq `openai/gpt-oss-20b`, com `freeOnly: true`. Foi criado backup antes da migração. Esta verificação não consumiu chamadas remotas.

## Modelo de dados

| Camada        | Tabelas                                                                      | Papel                                                                                         |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Histórico     | `foundation_conversations`, `call_sessions`, `call_turns`, `speech_segments` | Entrada original, estado do turno, texto gerado e reprodução confirmada                       |
| Fatos         | `memory_facts`, `memory_fact_sources`                                        | Texto, categoria, classificação, permissão, estado, origem, versão, datas e evidência literal |
| Grafo         | `memory_entities`, `memory_relations`                                        | Entidades e relações vinculadas a um fato, sem verdade independente                           |
| Resumos       | `memory_summaries`, `memory_job_sources`                                     | Checkpoints extrativos com fontes, classificação e permissão própria                          |
| Processamento | `memory_jobs`, `memory_work_pending`                                         | Fila durável e compatibilidade com os trabalhos registrados na fase 1                         |
| Controles     | `memory_policy`, `memory_blocked_turns`, `memory_tombstones`                 | Política por proprietário, bloqueio de fontes e impressões digitais de fatos esquecidos       |
| Retomada      | `memory_resumptions`                                                         | Associação entre sessão nova e anterior; sequência reportada pelo cliente                     |

Um fato pode ter várias fontes. `suggested` significa que a informação aguarda revisão; `confirmed` indica confirmação manual ou aprovação segundo a opção automática habilitada pelo proprietário. `origin` distingue entrada direta do usuário, extração local e extração por LLM. No modo manual padrão, inferências não são automaticamente promovidas a fatos confirmados.

`kind` distingue `fact` (informação duradoura), `event` (acontecimento temporário) e `correction` (proposta de correção). Acontecimentos têm `expiresAt`, calculado desde a última fonte usada: entre 1 e 365 dias, com padrão de sete dias quando o extrator não informa um prazo. Vencidos deixam de participar da busca e do grafo imediatamente, mesmo antes da limpeza periódica. Correções podem conter `supersedes`, com ID e versão da memória alvo. Só a confirmação aplica a substituição: o alvo fica `superseded`, sua relação e derivados antigos são invalidados e a informação nova passa a valer. Se o alvo mudou, a confirmação retorna 409 para uma nova revisão. Uma correção sem alvo inequívoco não substitui registros anteriores; ela segue o modo de aprovação configurado como informação independente.

Relações usam sujeito, predicado e objeto. Predicados iniciais: `prefere`, `usa`, `desenvolve`, `chama_se`, `tem`, `relacionado_a`. Exemplo: `Amadeus → usa → Cartesia → usa → Clone aprovado`. Cada aresta pertence a um fato e acompanha sua confirmação, classificação, permissão e exclusão. Entidades são comparadas por normalização de caixa, acentos e pontuação; não existe fusão semântica automática de nomes ou resolução de homônimos.

## Extração e checkpoints

O worker verifica a fila a cada cinco segundos. Grupos de dois turnos na extração LLM ou oito no modo local, concluídos, interrompidos ou falhos com entrada não vazia, formam checkpoints; o encerramento permite processar o grupo final menor. O worker também pode fechar um grupo menor de uma chamada aberta depois de 15 segundos desde a última entrada, sem turno em execução. No máximo vinte trabalhos são enfileirados por passagem. A associação única entre turno e trabalho evita reprocessar o mesmo trecho, exceto em reconstrução ou atualização da reprodução. Uma lease ativa impede outra análise do mesmo proprietário, inclusive em outro processo. Em caso de cota esgotada, a janela de nova tentativa alcança também os outros trabalhos pendentes do extrator.

Padrão `extraction: "local"`: reconhece declarações simples como “meu nome é”, “prefiro”, “gosto de”, “uso” e “estou desenvolvendo”, com ou sem o pronome “eu”. Aceita os complementos coloquiais finais “, sabia?”, “, sabe?”, “, né?” e “, viu!”, removendo apenas esse complemento do fato e preservando a fala original como evidência. Por exemplo, “Eu gosto de café sem açúcar, sabia?” sugere a preferência por café sem açúcar. Perguntas sobre a própria declaração, negações, marcadores explícitos de ficção/hipótese e formas não reconhecidas não geram sugestões. Esse extrator é deliberadamente limitado; não interpreta livremente qualquer conversa; a aprovação é controlada pela política de memória. Não usa API, GPU ou treinamento.

Modo `extraction: "llm"`, escolhido para as conversas naturais desta instalação: usa um **provedor exclusivo da memória**, configurado em `/v1/memory/extractor`, independente do principal e de suas reservas. O prompt está em [memory-extraction-v1.md](../../code/backend/api/src/application/memory/memory-extraction-v1.md), com limite de 12.000 caracteres. O build copia o Markdown para o runtime compilado.

O complemento foi condensado para aproximadamente 3100 caracteres, conservando o contrato e as regras de fontes. Distingue negação explícita de informação não declarada: não fornecer um ranking não comprova ausência de favorito ou empate. Destaques, condições e associações novas precisam permanecer recuperáveis, mesmo quando já existe um fato mais geral. Uma reextração pode sugerir correção de uma interpretação anterior, com seu ID e versão; o código não infere o gosto correto por palavras-chave.

Cada análise recebe até dois turnos novos e até seis turnos anteriores da mesma conversa. Extração e revisão não recebem memórias existentes; a reconciliação posterior recebe até doze memórias confirmadas pertinentes e elegíveis. Respostas do assistente servem apenas para interpretar referências e incluem somente reprodução confirmada; a evidência precisa vir do usuário. Cada sugestão exige uma fonte do grupo atual; antecedentes podem ser citados quando necessários para resolver referências. Fontes bloqueadas são excluídas. A classificação mais restritiva alcança também o contexto anterior, impedindo que uma fala sintética libere histórico pessoal/local para outro provedor.

Na revisão de 06/10/2026, as falas selecionadas do usuário passaram a ser enviadas integralmente à extração e revisão; os cortes anteriores de 1.500/900 caracteres foram removidos para preservar contexto. As falas confirmadas do assistente continuam limitadas a 200 caracteres, com marcação de omissão. O tamanho do lote permanece limitado pelos turnos e pelo orçamento do extrator. Memórias existentes têm orçamento de seleção de 3.000 caracteres. Extração e revisão têm teto de 4.096 tokens de saída por chamada, incluindo o espaço consumido pelo raciocínio do modelo, e até 24 sugestões; reconciliação usa até 1.200 tokens. O perfil Groq usa raciocínio médio, temperatura zero e JSON Schema estrito específico de cada operação, aplicado somente às chamadas de memória. O modelo distingue afirmações duradouras, acontecimentos, hipóteses, ficção e correções; o código valida schema, fontes literais, fonte atual obrigatória e alvos/versionamento das correções. Uma citação válida não comprova que a interpretação é correta; a validação continua obrigatória e a revisão segue a política manual/automática escolhida. Resposta malformada ou evidência inventada não produz fato. [Saída estruturada Groq](https://console.groq.com/docs/structured-outputs).

O checkpoint é sempre extrativo, mesmo no modo LLM: guarda excertos de falas e texto de segmentos integralmente confirmados, IDs, omissão e reprodução parcial. Não usa narrativa gerada como verdade. Limites: 3.500 caracteres por checkpoint, 180 por fala do usuário e 100 por trecho do assistente, com marcas de truncamento. Confirmação parcial não identifica palavras ouvidas. Uma confirmação de reprodução posterior invalida o resumo anterior e agenda sua recomposição.

Extração local pode processar checkpoints em intervalos sem geração ativa durante uma chamada longa. A extração por LLM também pode processar grupos nas pausas de uma chamada aberta; as etapas compartilham um prazo de 90 segundos e são canceláveis quando nova chamada/turno começa. O início de uma chamada/turno impõe uma espera mínima de 15 segundos para nova análise de fundo, e a geração ativa continua tendo prioridade. A fila contém chaves de idempotência, fontes, estado, falhas, próxima execução e prazo de posse. Reinício devolve trabalhos em execução à fila e conta uma falha de processo. Falhas normais têm recuo exponencial e limite de cinco; quota, política, configuração desabilitada e prioridade de conversa adiam o trabalho sem consumir esse limite. `Retry-After` é respeitado. O estado e o motivo podem ser consultados sem conteúdo das conversas nos logs.

O primeiro provedor provisório aprovado foi **Groq `openai/gpt-oss-20b`**, fora da lista da conversa. Também existe um perfil **Z.ai `glm-4.7-flash`**, com chave `ZAI_GLM_FLASH`, para avaliar uma cota remota separada da Groq. A configuração é versionada em `settings`, e a contabilização usa um proprietário de orçamento separado (`OWNER_ID:memory`). Trocar esse extrator não altera os modelos da conversa; falhas não acionam suas reservas. O código recusa usar no extrator o mesmo provedor/modelo/endpoint que aparece no roteamento da conversa, inclusive se essa lista mudar depois da configuração.

O adaptador Z.ai usa somente o endpoint oficial `https://api.z.ai/api/paas/v4/chat/completions` e aceita exclusivamente `glm-4.7-flash`, listado com entrada e saída gratuitas. `glm-4.7-flashx`, modelos pagos e endpoints customizados são recusados antes do envio. As chamadas de memória usam `response_format: json_object`, temperatura zero e `thinking: disabled`; JSON mode não equivale a JSON Schema estrito. Schema e evidências continuam sendo verificados localmente. Disponibilidade reportada por `health()` indica configuração carregada, não inferência nem cota verificadas; o ensaio remoto verifica acesso e qualidade separadamente. [API](https://docs.z.ai/api-reference/llm/chat-completion), [preços](https://docs.z.ai/guides/overview/pricing).

A leitura dos erros Z.ai é limitada a 8 KiB e usa somente códigos numéricos conhecidos, sem expor a mensagem remota. `1113` (saldo/pacote ausente), `1311` (plano sem acesso) e `1315` (chave de outro tipo de produto) são erros de configuração; `1302` e `1308` são limites de uso; `1305` é sobrecarga temporária. Pagamentos não são ativados, e erro de configuração adia a fila para correção pelo operador. [Códigos oficiais](https://docs.z.ai/api-reference/api-code).

O perfil inicial usa 50 solicitações/dia e 200.000 unidades conservadoras de orçamento. O extrator independente pode utilizar esse orçamento completo: a reserva antiga de 20% para conversas foi removida apenas dele, porque sua contabilização já é separada. Execuções de memória pelo serviço compartilhado continuam reservando margem para conversas. Essas unidades consideram bytes e teto de saída; não são a contagem real de tokens da Groq. Limites remotos por minuto/dia continuam valendo. Se faltam cota ou permissão, a tarefa permanece na fila; não há uso automático de outro modelo da conversa. O extrator local pode ser escolhido explicitamente para continuar sem API, com as limitações descritas acima.

`freeOnly: true` restringe os perfis suportados: Groq gpt-oss-20b, Z.ai glm-4.7-flash, OpenRouter `:free` com preço zero, Gemini não pago para conteúdo sintético ou endpoint local. Não ativa faturamento nem compra créditos. O operador deve manter a conta Groq no plano gratuito; a aplicação não consegue mudar ou comprovar o plano do provedor. O modelo, a variável de chave e o orçamento local são separados. Os limites remotos pertencem à organização e ao modelo: outra chave da mesma organização não cria uma cota isolada. A aplicação não identifica a organização da credencial nem garante cotas independentes. Gemini gratuito permanece impedido de receber dados pessoais pelos termos já observados no projeto. [Limites Groq](https://console.groq.com/docs/rate-limits), [termos Gemini](https://ai.google.dev/gemini-api/terms?hl=pt-BR).

## Recuperação e orçamento de contexto

Perguntas sobre identidade são comparadas semanticamente com o texto dos fatos, inclusive entre português e inglês; não há regex para “meu nome” nem lista de stop words em português. A busca lexical secundária usa frequência das palavras no conjunto de candidatos, conservando correspondências literais de nomes/códigos. O extrator continua resolvendo correções explícitas de grafia no próprio lote, citando apresentação e correção.

Em 05/10/2026, um trabalho com apresentação e correção do nome ficou pendente por `QUOTA_EXCEEDED`: a margem antiga reservada para conversas impedia o extrator independente de usar parte de seu próprio orçamento. A remoção dessa margem apenas no extrator e o processamento nas pausas permitiram concluir os trabalhos pendentes sem alterar limites. O nome corrigido ficou confirmado, elegível e associado às duas fontes; outro processo recuperou esse fato em contexto de nova conversa sem executar modelos. Verificação de regressão: 339 testes da API e 47 dos clientes, além de formatação, lint, tipos e build. Isso verifica o caso observado; não garante interpretação correta de todo nome ou toda correção.

1. Calcular o embedding da nova fala em CPU local e percorrer as páginas de fatos confirmados, válidos e elegíveis do proprietário. O índice semântico não tem corte pelos quarenta fatos mais recentes.
2. Selecionar até doze candidatos por similaridade e buscar até quarenta candidatos lexicais no SQLite. Considerar também as duas últimas falas para perguntas com referências contextuais. Um classificador local reordena até 24 candidatos por relevância antes da seleção. Coincidências genéricas não anulam rejeição semântica. Correspondência da consulta literal inteira pode acrescentar nomes/códigos específicos.
3. Expandir no máximo duas relações e um salto de proveniência entre fatos extraídos da mesma fala, com teto de 120 candidatos. Essa proveniência adiciona contexto complementar; não comprova uma relação semântica entre os fatos e não envia a fala original. O nó genérico `usuário` não expande todas as preferências.
4. Filtrar confirmação e elegibilidade **antes** de atravessar relações; uma aresta privada não serve de ponte para recuperar outro fato.
5. Priorizar significado, correspondência lexical secundária e recência; selecionar até doze fatos, sem cortar um fato no meio.
6. Acrescentar excertos pertinentes dos checkpoints da própria conversa, se permitidos.

Limites adicionais de memória: 3.000 caracteres de fatos e seus agrupamentos de proveniência, e 1.200 de excertos de resumos, mais o envelope JSON. O histórico recente mantém o teto existente de 3.000 caracteres e doze turnos. O prompt de persona mantém sua montagem e seu limite próprio. Esses limites medem caracteres, não tokens.

`coMentioned` contém grupos de índices da lista `facts` que compartilham uma fala de origem. Só inclui fatos selecionados e autorizados; não envia citações, IDs das fontes ou fatos privados. Ajuda a responder quais detalhes foram mencionados juntos, sem criar uma aresta semântica nem afirmar que uma playlist contém um artista apenas pela coocorrência. A direção de resposta está em [memory-response-v1.md](../../code/backend/api/src/application/memory/memory-response-v1.md), complemento com teto de 2.000 caracteres copiado pelo build. Ela distingue contexto relacionado de suporte para responder, preserva complementos úteis e exige reconhecer detalhes desconhecidos.

O modelo é [BGE-M3 convertido para ONNX](https://huggingface.co/Xenova/bge-m3), revisão `4de13258303883538bd53b696b452bf8099f0858`, quantização q8, pooling CLS, vetores normalizados de 1.024 dimensões. É usado somente o vetor denso; as outras modalidades do BGE-M3 não foram integradas. Texto livre do fato é a entrada do modelo; categorias e predicados não viram uma lista de assuntos reconhecidos. Cada texto tem teto de 512 tokens do tokenizador local. A extração compara as falas separadamente, evitando omitir a última correção num único texto concatenado. [Uso e especificações oficiais](https://huggingface.co/BAAI/bge-m3).

`setup:memory-search` baixa os arquivos fixados sem enviar conversas. No runtime, `allowRemoteModels=false` e `local_files_only=true` impedem downloads e APIs de inferência. O worker executa ONNX em CPU, com dois threads internos e um de coordenação, mantendo o loop da API livre. Requisições ao worker têm prazo de 30 segundos; falhas deixam a busca lexical ativa e são informadas em `memory -- status`, com nova tentativa após 60 segundos. Depois de instalar um cache ausente, reinicie a API. A biblioteca Transformers.js é fixada em 3.8.1 para carregamento offline; a dependência `sharp` é sobrescrita para 0.35.4 corrigida. [Configuração local da biblioteca](https://huggingface.co/docs/transformers.js/v3.8.1/api/env).

`memory_embeddings` é um índice derivado, associado ao fato por chave estrangeira, com versão, hash do texto e identificação completa do modelo. Os vetores ficam no SQLite e não entram no prompt. Atualizações do fato apagam seu vetor; exclusão faz cascade. A gravação exige proprietário e versão ainda atuais, impedindo ressuscitar um registro apagado/editado. A seleção final confere a versão novamente depois da inferência, além das permissões. Mudança de modelo ou cache inválido dispara reindexação. O índice não faz mesclagem automática nem comprova que dois fatos são equivalentes.

A indexação preexistente é incremental: até 16 fatos por rodada nas pausas, em lotes de oito. A recuperação também pode completar um lote; um acervo recém-migrado grande pode precisar de várias rodadas antes de ter cobertura semântica integral. Consultas percorrem páginas de até 128 fatos, com comparação exata dos vetores; o custo cresce linearmente com o acervo. Isto atende o banco local atual, mas acervos grandes devem ser medidos antes de adotar um índice aproximado.

O corte atual de candidatos é similaridade cosseno de 0,40 e uma janela de 0,18 do melhor candidato. O classificador usa corte absoluto de 0,05, sem eliminar um detalhe complementar apenas porque outro candidato tem score muito maior. Esses valores são critérios de seleção, não probabilidades de verdade. O mesmo mecanismo fornece os fatos anteriores à LLM extratora para avaliar correções. Confirmação, autorização, evidência literal e versão continuam sendo validadas por código.

O classificador é o [Jina Reranker v2 multilingual](https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual), revisão `9cfeff2df7d40d1b78e75e5e9cebec92a99813c9`, ONNX q8, pares de consulta/fato limitados a 256 tokens. Sua licença é **CC-BY-NC-4.0**; a integração atende uso pessoal/não comercial, e uso comercial exige avaliar a licença. Não carrega Python nem código remoto do repositório do modelo. O provisionamento explícito baixa seus arquivos; o runtime é offline. Usa processo local separado para isolar o binding nativo ONNX do worker de embeddings no Windows, sem janela visível. Prazo de classificação: dez segundos; em falha, conserva scores semânticos e informa `ranking.state: degraded`, com intervalo de nova tentativa de sessenta segundos. `MEMORY_RERANK_ENABLED=false` desativa essa camada. Versões e permissões são conferidas novamente após a classificação.

O prompt de extração preserva nomes, associações, qualificadores e detalhes novos no texto recuperável. `relation.predicate` aceita rótulos curtos em qualquer idioma, sob limites estruturais; não é mais uma enumeração fechada de seis relações. Isso amplia o repertório, mas predicados equivalentes de idiomas diferentes ainda podem gerar arestas distintas. A evidência literal continua obrigatória. Evidências não são anexadas automaticamente ao prompt da conversa, pois podem conter dados além do fato autorizado ou versões já corrigidas.

As cotas locais retêm a reserva completa enquanto uma chamada está pendente. Após conclusão com contagens de entrada e saída, usam o consumo reportado. Falhas e contagens incompletas conservam a estimativa, e pedidos falhos continuam contando. Os limites remotos, o plano da conta, a política de dados e `freeOnly` não mudam. Leitura de política deixa de realizar escrita quando o registro já existe; conexões SQLite aguardam até três segundos por escritas breves de outros processos.

API e CLI compartilham uma concessão de trabalho por proprietário, válida por até 120 segundos. Reiniciar outro processo não toma uma concessão ainda válida; após uma queda, a tarefa pode aguardar sua expiração. A falta de cota adia também os outros trabalhos pendentes desse proprietário, evitando tentativas simultâneas no mesmo extrator. Nenhuma dessas mudanças elimina contagens ou muda credenciais para contornar limites.

Avaliação real local em 05/10/2026: 24/25 verificações passaram em dados inteiramente fictícios, sem chamadas remotas. Nome por paráfrase/inglês, café em inglês, cultivo de cogumelos entre idiomas, temas novos, edição, esquecimento, privacidade e persistência após reinício foram recuperados. A pergunta “Você lembra se eu adoço a bebida que tomo de manhã?” selecionou a memória de regar orquídeas aos sábados de manhã e omitiu o café; essa referência vaga permanece uma limitação. A revisão não acrescenta uma exceção para essa frase. O relatório registra candidatos e tempos, permitindo retestar sem modificar o conjunto para ocultar a falha. O ensaio mede recuperação, não respostas finais. Perguntas sem evidência não devem ser respondidas por inferência a partir de fatos apenas parecidos. A LLM continua orientada a usar somente o que for pertinente.

Verificação da integração: 353 testes da API passaram, com formatação, lint, tipos e build. Os testes adicionais cobrem cache persistido, alcance de fatos antigos, isolamento antes da inferência, invalidação, cache corrompido/mudança de modelo, versão alterada durante inferência, correção entre idiomas e prioridade de um turno novo sobre a análise de fundo. O build compilado também recuperou o fato de identidade existente no banco desta instalação para “What is my name?”, com três fatos indexados, sem consulta remota. Foi salvo um snapshot SQLite antes dessa verificação. O ensaio verifica o contexto entregue à conversa; não executa nem avalia uma resposta final da LLM principal.

Fatos são recuperáveis entre conversas; checkpoints são consultados dentro da conversa à qual pertencem. A recuperação acrescenta contexto ao histórico já limitado. A economia deve ser comparada com o envio integral da memória, não apresentada como redução comprovada frente ao pipeline anterior, que já limitava o histórico.

## Privacidade, armazenamento e retenção

Estado inicial: memória sintética habilitada, extração local, memória pessoal desabilitada e `retentionDays: null`. A instalação não passa a processar conversas pessoais antigas ou a excluí-las automaticamente ao atualizar o código.

Antes de ativar memória pessoal, a configuração exige uma retenção entre 1 e 3.650 dias e reconhecimento do armazenamento local. O SQLite atual não implementa criptografia própria. A proteção em repouso depende das permissões do sistema e de criptografia de disco, se configurada pelo operador; BitLocker não foi ativado nem verificado pela implementação. Banco, backups, relatórios e arquivos privados continuam ignorados pelo Git.

Quando configurada, a retenção remove conversas inativas desde o último encerramento e fatos sem atualização além do prazo. Sessões abertas são preservadas. A limpeza roda no worker, aproximadamente uma vez por hora, com lotes limitados; não é um serviço de exclusão no instante exato do vencimento. Uma conversa reativada mantém seu histórico enquanto estiver dentro da política de atividade. Desabilitar o worker pausa também essa limpeza. Exporte ou faça backup antes de habilitar um prazo que alcance dados existentes.

No modo manual padrão, fatos e checkpoints começam com `permission: "local-only"`. A confirmação manual de um fato não autoriza automaticamente envio remoto. `eligible` permite considerar o envio, mas a classificação e a política do provedor ainda precisam permitir:

| Turno/contexto | Memória permitida                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `synthetic`    | Apenas memórias sintéticas, confirmadas e elegíveis                                                 |
| `personal`     | Memórias sintéticas/pessoais elegíveis; provedor precisa da aprovação pessoal existente             |
| `local-only`   | Memórias pertinentes, inclusive restritas ao local; toda a requisição permanece no roteamento local |

Histórico recente continua carregando sua classificação mais restritiva; a retomada não reclassifica histórico pessoal/local como sintético. Extração LLM usa a classificação mais restritiva das suas fontes. As permissões dos fatos não substituem a política da conversa original. Revogar a permissão de um fato também suprime suas fontes da recuperação e invalida resumos associados. Alterações de memória aguardam a conclusão do turno ativo para não disputar o contexto de uma resposta já em geração.

## Correção, esquecimento e exclusão

### Equivalências e entidades

A migração `0006_memory_equivalence` acrescenta um índice de equivalência. O preenchimento em lotes é retomável e normaliza referências do sujeito `eu`, `usuário` e suas variantes para `usuário`, sem alterar o texto original nem as citações. O nó genérico permanece excluído da expansão do grafo: compartilhar esse sujeito não basta para recuperar todas as preferências. A normalização não atribui declarações de terceiros ao proprietário.

A chave de equivalência só é produzida para preferências duradouras simples cujo texto e relação descrevem o mesmo objeto. Formas como “gosto de” e “prefiro” podem equivaler; negações, condições, eventos, correções e textos com informações adicionais não são fundidos por aproximação. A extração continua semântica por LLM; essa regra conservadora atua apenas na deduplicação e não limita quais informações ela pode sugerir. Não há comparação semântica universal nem dependência de embeddings.

Novas sugestões equivalentes na mesma classificação reutilizam o registro existente e preservam evidências. No modo manual, não promovem uma sugestão a fato confirmado nem ampliam a permissão existente. Com aprovação automática, uma sugestão derivada reencontrada em evidência válida pode ser confirmada; fatos já revisados conservam suas permissões. Para dados legados, `POST /v1/memory/consolidate` e `memory -- consolidate` trabalham por proprietário, aguardam o fim do turno e unem fontes numa transação. Priorizam um registro confirmado, incrementam sua versão e invalidam extrações concorrentes. Registros com classificações diferentes, permissões confirmadas conflitantes ou alvos de correções pendentes não são unidos. O retorno informa `merged` e `skipped`. Exclusão e reconstrução continuam aplicando bloqueios às fontes reunidas.

`memory -- review` apresenta texto, ID, versão, classificação, estado e comandos reais para confirmar localmente, autorizar uso remoto ou esquecer. `--json` mantém integração com ferramentas. Erros de argumentos são apresentados sem stack trace; um marcador de exemplo recebe orientação para consultar a revisão. `memory -- review` também consulta o estado do processamento e informa quando novas falas ainda aguardam cota do extrator; `--json` inclui `processing.policy` e `processing.jobs`. A interface completa de gestão continua na fase 5.

- Edições exigem `expectedVersion`; política exige `expectedRevision`. Versão antiga retorna 409.
- Correção explícita preserva o ID, incrementa a versão e prevalece sobre extrações. Sua relação é reconstruída e entidades órfãs são removidas.
- As fontes afetadas são bloqueadas para extração e para histórico usado pela LLM; checkpoints e demais fatos automaticamente derivados desses turnos são invalidados. Esse bloqueio por turno é conservador e pode retirar outras sugestões daquele trecho.
- `DELETE /v1/facts/:id` remove o fato e sua aresta, conserva uma impressão digital de bloqueio e informa se o histórico original permanece. Evidências derivadas afetadas não conservam uma cópia literal do dado invalidado.
- `eraseSources: true` também redige o texto completo dos turnos identificados e de seus segmentos. Não há alinhamento suficientemente preciso para apagar só uma palavra com segurança.
- Reconstrução conserva bloqueios e correções explícitas. Não transforma fatos antigos apagados em novas sugestões a partir das mesmas fontes.
- Exclusão de conversa remove sessões, turnos, segmentos, checkpoints e tarefas. Fatos automaticamente derivados apenas dela são removidos; os que têm fontes sobreviventes voltam à revisão. Fatos explicitamente editados/criados pelo usuário são tratados como declarações independentes.
- Um contador de invalidação por proprietário impede que uma extração iniciada antes de uma mudança grave resultados antigos depois dela. O commit de resultados e fontes é transacional.

Quando todas as evidências de uma correção já existiam antes de o fato alvo ser criado, a substituição reinterpreta material antigo. Nesse caso, o fato incorreto é substituído e sua relação deixa de ser recuperada, mas a fala original e os fatos irmãos corretos permanecem válidos. A comparação usa datas das fontes e da criação do fato, não regras para assuntos ou idiomas. Se houver declaração posterior ou correção manual sem fontes, mantém-se a invalidação conservadora das fontes antigas. Evidência anterior identifica a condição estrutural; não prova sozinha a correção semântica da nova interpretação.

Os controles alcançam o banco corrente. Exportações, backups anteriores e registros já enviados a terceiros não são apagados por essas operações. Apagar um fato não impede que o usuário faça uma nova declaração explícita ou o recrie manualmente; não há detector semântico universal de paráfrases.

## Retomada da chamada

O cliente solicita um **ticket novo, de uso único**, para a mesma conversa autenticada e abre outro WebSocket. Em vez de `session.start`, envia `session.resume` com `previousSessionId`, `lastSeq`, classificação e formato de áudio.

A API valida proprietário e vínculo da sessão anterior com a conversa. Cria sessão e identificadores novos, cancela uma sessão anterior ainda ativa e restaura contexto da persistência. `session.ready` informa `resumedFrom` e `replayedAudio: false`. O estado expressivo começa como numa sessão nova. Áudio e falas interrompidas não são reenviados; o usuário decide se quer repetir a pergunta.

`lastSeq` é registrado como diagnóstico do último evento de controle observado; não é cursor de replay, prova de reprodução ou confirmação de palavras. A reprodução continua dependente de `playback.progress`. O SDK fornece `resumeState()`. No cliente de teste, depois de uma queda inesperada, clicar em Conectar retoma a conversa na mesma página; Encerrar chamada inicia uma próxima conversa nova. Recarregar a página descarta esse estado efêmero; a API permite escolher uma conversa persistida posteriormente. Não há loop automático de reconexão.

## Operação pela CLI

### Atualização de bancos existentes

A migração `0003_hybrid_memory` conserva o esquema inicial da fase 3. A migração seguinte, `0004_memory_search_and_permissions`, acrescenta o índice textual dos fatos, a permissão e a versão dos checkpoints e a tabela de retomada. Esses acréscimos precisam de uma nova migração: alterar o arquivo de uma migração já aplicada não faz o Drizzle executá-la novamente.

A inicialização da API e `npm run db:migrate` aplicam a atualização e preenchem os índices vazios em lotes, usando a mesma normalização de acentos da busca. Esse preenchimento pode continuar após um reinício; não altera textos, classificações, confirmações, versões nem permissões dos fatos existentes. Checkpoints antigos recebem a restrição `local-only` e versão 1. Um teste de regressão atualiza um banco com fatos, relações, resumos, política pessoal e bloqueios existentes e verifica a recuperação após dois reinícios.

Um banco com a versão inicial já aplicada, mas sem esses acréscimos, podia emitir `INTERNAL_ERROR` antes de `reply.start`, devido à ausência de `memory_facts.search_text`. A correção preserva o banco e a política configurada, sem exigir apagar os dados ou ativar memória pessoal novamente.

Na pasta `code/backend/api`, com a API iniciada e `.env` configurado:

```powershell
npm run memory -- status
npm run memory -- configure --personal --extraction=local --retention-days=30 --acknowledge-local-storage
npm run memory -- facts
npm run memory -- graph
```

O comando de configuração consulta a revisão atual. O reconhecimento inclui armazenamento local sem criptografia própria e a aplicação da retenção a dados existentes. Para ensaios fictícios, omita `--personal`. O modo LLM é optativo: troque `--extraction=local` por `--extraction=llm`; consumirá o orçamento próprio do extrator e a cota remota da organização quando existir capacidade.

Para configurar o modelo exclusivo e usar interpretação semântica:

```powershell
npm run memory -- configure-extractor --file=config/memory-extractor.groq.example.json
npm run memory -- configure --personal --extraction=llm --retention-days=30 --acknowledge-local-storage
npm run memory -- extractor
npm run memory -- status
```

O exemplo usa `GROQ_GPT_OSS_API_KEY`, dedicada ao extrator, sem expor seu valor. A conversa continua usando suas variáveis atuais, incluindo `GROQ_API_KEY`. Configure a chave dedicada no `.env` e reinicie a API antes de aplicar o perfil. A escolha da credencial é fixa; não há rotação automática entre contas em caso de cota. O isolamento remoto depende da organização vinculada à credencial e não é verificado pelo Amadeus. O exemplo contém o registro da política aprovado para esta instalação; outros operadores precisam revisar a política e atualizar sua referência/data antes de usá-lo com dados pessoais. A CLI consulta a revisão do extrator quando `expectedRevision` não aparece no JSON; uma revisão explícita é respeitada. Confirmação pela CLI conserva também tipo, validade e alvo de correção. Edições completas precisam preservar esses campos quando apropriado.

Mudar para `llm` afeta tarefas pendentes e futuras; conversas cujo processamento local já terminou não são enviadas novamente automaticamente. `rebuild` permite solicitar essa reconstrução explicitamente, preservando fatos confirmados, bloqueios e correções.

Para avaliar a alternativa Z.ai antes da troca, use `npm run eval:memory-semantic -- --run --profile=config/memory-extractor.zai.example.json`. `--profile` carrega uma configuração candidata somente para o ensaio, sem gravá-la em `settings`; o consumo permanece contabilizado no orçamento real da memória para esse provedor. Sem `--run`, o comando apenas informa o plano. O relatório distingue falha de execução de erro de validação, e marca as verificações semânticas como não executadas quando falta uma extração válida. Após validar acesso e qualidade, aplique com `npm run memory -- configure-extractor --file=config/memory-extractor.zai.example.json`. O perfil exige `ZAI_GLM_FLASH` disponível no processo da API e reutiliza a política de memória/retenção configurada, sem modificar a conversa.

Após revisar uma sugestão:

```powershell
npm run memory -- confirm --id=UUID --permission=eligible
npm run memory -- forget --id=UUID --version=2
npm run memory -- forget --id=UUID --version=2 --erase-sources
npm run memory -- rebuild --id=UUID_DA_CONVERSA
npm run memory -- summaries
npm run memory -- permit-summary --id=UUID --version=1 --permission=eligible
```

Confirme fatos reais como `personal`, nunca como `synthetic`. `confirm` conserva o texto, a relação e a classificação e consulta a versão atual; `edit --id=UUID --file=arquivo.json` envia uma edição completa, incluindo `expectedVersion`, `status`, `text`, `category`, `dataClass`, `permission` e `relation`. `create --file=arquivo.json` aceita os campos do fato, sem metadados internos. Dados pessoais nesses arquivos devem ficar em `data/`, ignorado pelo Git.

As mesmas operações têm rotas REST autenticadas: `GET/POST /v1/facts`, `PATCH/DELETE /v1/facts/:id`, `GET/PUT /v1/memory/policy`, `GET /v1/memory/status`, `/v1/memory/graph`, `/v1/memory/summaries`, `/v1/memory/export`, `PATCH /v1/memory/summaries/:id`, `GET /v1/conversations`, `GET/DELETE /v1/conversations/:id` e `POST /v1/conversations/:id/memory/rebuild`. Schemas e erros são publicados no OpenAPI. Interface completa de revisão permanece na fase 5; não é necessário esperar por ela para gerir os dados pela CLI.

## Backup, exportação e restauração

`npm run backup:memory` cria um snapshot independente em `api/data/backups/` com `VACUUM INTO`. O snapshot representa o SQLite completo, incluindo memória, bloqueios, trabalhos, configurações e metadados de chamadas. A operação considera o estado transacional do SQLite, em vez de copiar apenas um arquivo aberto e ignorar WAL.

`npm run memory -- export --out=data/memoria-exportada.json` exporta somente dados de memória/histórico do proprietário autenticado em UTF-8, sem sobrescrever arquivos existentes. É um formato de inspeção/portabilidade, sem importador automático. Não substitui o snapshot completo do banco.

Para restaurar o snapshot: encerre a API e os clientes que usam o banco; preserve uma cópia do banco atual e seus arquivos auxiliares; substitua o banco apontado por `DATABASE_URL` pelo snapshot, sem reaproveitar WAL/SHM da versão substituída; inicie a API e confira `memory -- status`, fatos e reconstrução. A inicialização aplica migrações e retoma tarefas. Não restaure um snapshot antigo esperando que contenha exclusões feitas depois dele.

Referências de voz, modelos dos serviços de áudio e `.env` são arquivos separados e não entram no snapshot SQLite. Preserve-os separadamente para recuperar também a voz e os serviços; a memória em si e os metadados de referência estão no banco. O teste de restauração desta fase cobre o SQLite de memória, seus trabalhos e os bloqueios de esquecimento, não uma reinstalação completa dos motores de voz.

## Validação e limites de aceite

Os testes verificam extração manual e aprovação automática opcional, citações, reprodução parcial, checkpoint, idempotência, cotas, prioridade, proprietários, versões, correções, exclusão, reconstrução, reinício, snapshot/restauração, rotas autenticadas e recuperação na chamada WebSocket. Provedores de teste são locais/simulados; essa verificação não consome APIs remotas.

`npm run eval:memory` mede trinta recuperações após cinco aquecimentos em 1.002 fatos fictícios, valida relevância básica e ausência de contexto para assunto desconhecido e salva relatório em `data/memory-evals/`. Compara caracteres recuperados ao envio integral dos fatos, registra p50/p95 da recuperação local e faz zero chamadas de LLM. Não é avaliação semântica abrangente, contagem real de tokens ou benchmark de latência total da voz.

`npm run eval:memory-semantic -- --run` consome uma chamada do extrator configurado para analisar sete falas inteiramente fictícias, com seis verificações semânticas básicas: preferência natural, referência contextual, acontecimento temporário, ficção, correção vinculada e cumprimento. Também verifica contrato e fontes, totalizando sete verificações. Salva o resultado e a resposta bruta em `data/memory-evals/`, inclusive quando a validação da extração rejeita a resposta; não persiste esses fatos no histórico real. Sem `--run`, apenas informa o plano do ensaio. É uma regressão pequena, não uma certificação de interpretação para qualquer conversa.

A implementação entrega a base operacional da fase 3. O aceite com conversas pessoais e inferência real depende da configuração consciente da política, revisão dos fatos e ensaio de uso. O gate textual da fase 2 e os benchmarks físicos anteriores continuam pendentes. Fine-tuning, módulos cognitivos, neurochemistry, Hebb, NPC proativo e interface Live2D permanecem fora desta fase. Embeddings e classificação local de relevância foram acrescentados nas correções posteriores descritas acima.

Verificação em 05/10/2026: formatter, lint, typecheck, 277 testes da API, 47 testes do cliente e build passaram. O ensaio sintético com 1.002 fatos recuperou 424 caracteres; p50 de 2,32 ms e p95 de 3,72 ms para a busca local neste computador. Resultados de caráter sintético, com escopo e limitações descritos acima; não houve envio de conversas reais para avaliação.

Após a integração do extrator independente, formatter, lint, typecheck, **303 testes da API** e build passaram. Os ensaios iniciais no modelo remoto mostraram citação alterada, ficção indevidamente sugerida, antecedente não citado e resposta truncada. Isso motivou JSON Schema estrito, reforço do Markdown, temperatura zero, raciocínio médio e teto de 4.096 tokens. O ensaio final passou nas sete verificações em aproximadamente 5,27 segundos, registrado em `api/data/memory-evals/semantic-2026-10-05T19-05-15-804Z.json`. Esse tempo mede a chamada de extração em segundo plano, não a resposta de voz. As falhas iniciais permanecem registradas e não são evidência de qualidade resolvida universalmente. A configuração local está em `llm`, pessoal habilitado e retenção de 30 dias; uso real e revisão humana continuam necessários.

### Fechamento funcional — 05/10/2026

O usuário confirmou em uma nova conversa a recuperação da preferência por café sem açúcar. Os dois registros legados desse fato foram consolidados, com preservação das evidências, do ID confirmado e da permissão autorizada. O extrator ativo continua `openai/gpt-oss-20b`, com `GROQ_GPT_OSS_API_KEY`; a Z.ai segue candidata sem acesso validado.

O ensaio integrado sintético concluiu quinze verificações no relatório local `api/data/memory-evals/integrated-2026-10-05T20-22-02-830Z.json`: extração natural, revisão obrigatória, exclusão de ficção, evento temporário, recuperação entre conversas, correção vinculada antes/depois da revisão, respostas reais coerentes com a preferência vigente, expiração simulada, registro de retomada, esquecimento, reconstrução e reinício em processo separado. Usou duas extrações reais no gpt-oss-20b e três respostas concluídas: Qwen/Groq antes da correção e após o esquecimento, Gemini na correção, somente com dados sintéticos. Não houve envio de memória pessoal ao Gemini.

A primeira tentativa foi interrompida por `INTERNAL_ERROR`, cuja causa não foi identificada; a repetição concluiu a extração e a correção. Cota/indisponibilidade interromperam a última resposta, concluída depois por `--resume`, sem repetir extrações ou elevar limites. Esses relatórios anteriores permanecem locais; o resultado final não apaga as falhas nem garante disponibilidade permanente dos provedores. A verificação de retomada deste ensaio é de persistência/validação; o fluxo WebSocket sem replay também possui regressão automatizada.

Formatação, lint, tipos, **320 testes da API**, build e **47 testes dos clientes** passaram. O escopo funcional da fase 3 está concluído e validado nesses cenários. Não é certificação de interpretação de qualquer conversa, deduplicação de qualquer paráfrase, desempenho físico de voz ou naturalidade geral da persona. Interface completa e técnicas comportamentais avançadas e as pendências anteriores permanecem nas fases/experimentos próprios.

### Rejeição de interpretação automática

Use `npm run memory -- reject-interpretation --id=UUID --version=N` para retirar uma interpretação automática incorreta. Exige proprietário e versão atual; recusa fatos de origem `user` e já substituídos. Marca o registro como `superseded`, remove relação/embedding e bloqueia a reextração do mesmo texto normalizado. Preserva a fala original e fatos irmãos; outras interpretações ainda podem ser extraídas. É revisão explícita, sem heurística de conteúdo. Para apagar dados ou bloquear suas fontes, use `forget`. A rejeição não é uma garantia de bloquear todas as paráfrases do mesmo erro.

### Revalidação ampliada — 06/10/2026

A seleção semântica e o classificador local passaram a recuperar complementos da mesma fonte autorizada, preservando os filtros de dados e versões. Durante a reextração, fatos derivados de fontes atuais válidas têm prioridade; depois entram outros fatos relevantes. O teto de 3.000 caracteres inclui agora o JSON das memórias existentes, com identificadores e relações, e continua limitado a doze fatos. Fontes enviadas ao modelo contêm apenas identificador, data, texto do usuário, fala confirmada do assistente e marcas de truncamento. Os metadados operacionais permanecem no código.

Os testes de recuperação, correção, esquecimento, expiração, autorização, concorrência e reinício passaram. A avaliação sintética de busca registrou 22/25, conservando três controles falhos. Na avaliação pessoal autorizada, detalhes anteriormente ausentes passaram a ser selecionados, mas ainda ocorreram omissões e inferências indevidas nas respostas e perda de qualificadores na extração. Encontrar o texto relevante não comprova que o modelo responderá corretamente. Uma interpretação incorreta foi rejeitada explicitamente, sem inserir um fato esperado para fazer o teste passar.

O prompt condensado ainda precisa completar a nova validação semântica remota. Uma gravação intermediária com perda de acentos foi corrigida em UTF-8; resultados dessa versão não validam sua qualidade. Os relatórios pessoais, falhas e bases isoladas permanecem em `api/data/personal-evals/`, ignorados pelo Git. A ampliação de cota foi somente local e temporária; o teto original de 200 mil tokens/dia foi restaurado, preservando provedores gratuitos, políticas e limites remotos. O fechamento funcional anterior refere-se aos cenários então executados; a avaliação ampliada não está concluída.
