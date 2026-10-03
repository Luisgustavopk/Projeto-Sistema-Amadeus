# Projeto Amadeus: plano de desenvolvimento

**Versão 2.1 | 2 de outubro de 2026 | Status: projeto revisado, implementação e benchmarks pendentes**

## 1. Objetivo e decisões aprovadas

Construir uma Amadeus inspirada na personalidade da Kurisu de Steins;Gate: conversa por voz em português brasileiro, memória entre conversas, texto, imagens e um avatar Live2D. A experiência deve parecer uma ligação: ouvir, responder e aceitar interrupções sem exigir um botão a cada fala.

**A voz personalizada é essencial.** A identidade vocal deve permanecer reconhecível entre frases, emoções e sessões. Uma voz genérica não substitui esse requisito. O pipeline escolhido é STT (transcrição) + LLM (resposta) + TTS (síntese com a voz personalizada).

### 1.1 Escopo comprometido desta versão

- API independente em Node.js, TypeScript e Fastify.
- Cliente React para navegador e aplicativo desktop empacotado com Tauri, inicialmente para Windows.
- Chamadas por voz com detecção de fala, interrupção, reconexão e legendas.
- Voz personalizada em pt-BR, personalidade consistente e expressão emocional coordenada.
- Avatar Live2D com expressões, movimentos e sincronização da boca.
- Texto e imagens, inclusive durante chamadas.
- Histórico, resumos e fatos consultáveis, corrigíveis e removíveis.
- Autenticação básica, limites de uso, métricas e recuperação de tarefas.
- SQLite + Drizzle, arquivos locais, testes e execução do backend em Docker.

Live2D e desktop têm fases próprias e critérios de aceite. Uma interface simples pode ser usada para testar áudio antes dessas fases; ela não representa a entrega final do projeto.

### 1.2 Somente estes itens foram adiados nesta revisão

| Item adiado | Solução desta versão | Condição para reavaliar |
| --- | --- | --- |
| Embeddings e banco vetorial | Fatos selecionados por categoria, recência, palavras-chave e busca textual; resumos limitados por orçamento de contexto | Busca textual deixar de recuperar memórias relevantes nos testes |
| Administração completa de múltiplos clientes | Uso pessoal, proprietário único, credencial básica e sessões autenticadas; emissão e revogação simples | Necessidade real de gerenciar vários clientes ou usuários |
| Garantia de 95% de disponibilidade mensal | Medir falhas e disponibilidade sem compromisso mensal; tratar quedas e reinícios | Hospedagem contínua e dependências com capacidade previsível |

## 2. Arquitetura e responsabilidades

```text
Microfone -> cliente (AEC + VAD) -> WebSocket -> STT local
                                                  |
Persona + memória selecionada -> LLM na nuvem -> segmentos falados
                                                  |
                                    direção de expressão
                                                  |
                         TTS local com voz personalizada
                                                  |
Cliente <- áudio + metadados por segmento <- API Amadeus
   |                           |
reprodução + Live2D       SQLite + arquivos + tarefas duráveis
```

### 2.1 Backend

- Domínio: Conversation, CallSession, Message, Fact, Persona, VoiceProfile, SpeechSegment e MemoryJob.
- Aplicação: montagem do contexto, orquestração de turnos, seleção de expressão, cancelamento e memória.
- Portas: LlmProvider, SttProvider, TtsProvider, repositórios e armazenamento de arquivos.
- Adaptadores: implementações específicas de provedores e serviços Python.
- Entrada: rotas REST e eventos WebSocket validados, sem duplicar regras de negócio.

Node coordena a aplicação. Inferência local de áudio roda em serviço Python separado, evitando bloquear o processo da API. A primeira implantação pode ter um processo Python para STT e outro para TTS, permitindo reiniciar ou cancelar o TTS sem perder a transcrição.

### 2.2 Cliente web e desktop

O cliente controla microfone, cancelamento de eco, reprodução, buffer de áudio, interrupção local, legendas e Live2D. As regras de persona, memória, autorização e escolha de provedores permanecem no backend.

Ao detectar nova fala, o cliente interrompe imediatamente a reprodução, limpa o áudio pendente e avisa a API. Ele não espera uma viagem de rede para silenciar. O servidor valida o evento e cancela o trabalho restante.

Hooks como useCall, useChat e useAvatar coordenam a interface. TanStack Query atende dados do servidor; estado efêmero da chamada fica em um controlador próprio/Zustand. Os clientes web e desktop compartilham componentes e contrato.

### 2.3 Pipeline escolhido e alternativas

O pipeline separado é uma decisão de produto: permite preservar a voz personalizada ao trocar a LLM. Modelos de voz direta não são incapazes de usar persona ou memória, mas uma voz pronta não atende ao requisito essencial desta versão.

Gemini Live deixa de ser um caminho concorrente de implementação obrigatória. Pode servir como referência opcional de fluidez em testes com dados fictícios, sem substituir o pipeline aprovado nem condicionar a entrega. Não há compromisso de construir dois sistemas de voz.

## 3. Stack e organização

| Área | Escolha |
| --- | --- |
| API | Node.js LTS, TypeScript, Fastify, Zod, OpenAPI |
| Transporte | REST para recursos; WebSocket para chamada, áudio e eventos |
| Persistência | SQLite + Drizzle; migrações; arquivos locais |
| Tarefas de memória | Tabela persistente de jobs, worker, tentativas limitadas e recuperação no reinício |
| Serviços de áudio | Python; faster-whisper como candidato de STT; Chatterbox como candidato de TTS |
| Interface | React + Vite + TypeScript; AudioWorklet; VAD no cliente |
| Avatar | Live2D; mapeamento de expressões e movimentos versionado |
| Desktop | Tauri; Windows como primeiro alvo de validação |
| Qualidade | Vitest, testes de integração de áudio, ESLint e Prettier |
| Execução | Docker para backend/serviços compatíveis; instalador desktop separado |

```text
amadeus/
  docs/{project,websocket,decisions}/
  code/
    frontend/                  # reservado; interface a definir
      desktop/                 # futuro shell Tauri
      assets/avatar/           # futuros recursos Live2D
    backend/
      api/src/                 # API, regras e persistência
      services/{stt,tts}/       # futuros serviços Python
      assets/{persona,voice-profiles}/
      evals/                   # futuras avaliações
  # Ferramentas, scripts e dependências da API em code/backend/api/
```

Frontend e backend não compartilham pacotes de código. Os schemas e a validação pertencem ao backend, que publica o contrato HTTP em OpenAPI. O frontend mantém seu próprio cliente da API e poderá gerar tipos a partir desse contrato. A comunicação de voz usa o contrato WebSocket documentado separadamente.

A estrutura inicial reserva o frontend sem implementar telas ou prévia web. A interface será discutida antes de sua implementação. As camadas internas do backend e os módulos do frontend serão criados conforme as respectivas fases.

EventEmitter pode notificar componentes, mas não é a fonte de verdade das tarefas de memória. Não se exige Redis/BullMQ nesta versão. O SQLite será acessado por repositórios; MongoDB deixa de ser uma decisão pendente.

## 4. Estratégia de provedores gratuitos

### 4.1 Decisão inicial e limites da evidência

**Primeiro adaptador de avaliação: Google Gemini 3.8 Flash**, com raciocínio baixo, saída curta e suporte a imagens. **Comparadores: Kimi K3 na NVIDIA e Qwen 3.8 27B no Groq.** A seleção é provisória até os testes da fase 1: não há benchmark deste projeto que prove qual interpreta melhor a personagem em pt-BR.

As páginas oficiais consultadas em 02/10/2026 apresentam essas ofertas. A disponibilidade real e os limites precisam ser conferidos na conta antes do uso. Não se assume gratuidade ilimitada, disponibilidade garantida nem a permanência de um modelo. [S1-S7]

| Candidato | Papel | Verificação necessária |
| --- | --- | --- |
| Gemini 3.8 Flash | Cérebro inicial para testes com dados fictícios | Acesso ao modelo, cotas, latência e compatibilidade da política de dados |
| Kimi K3 via NVIDIA | Comparação de qualidade de raciocínio, persona e visão | Latência com raciocínio ativo, limites e condições do endpoint de experimentação |
| Qwen 3.8 27B via Groq | Alternativa com visão, controle de raciocínio e controles de retenção | Qualidade da personagem, cota de tokens e configuração dos controles de dados |
| OpenRouter gratuito | Experimentos pontuais | Cota diária e política do provedor de cada modelo; não usar roteamento aleatório na chamada |

O Gemini Flash produz texto; a voz vem do TTS local. Gemini Live é outro modelo/produto e não deve ser confundido com esse adaptador. [S1]

### 4.2 Memória pessoal e dados enviados

O plano gratuito do Gemini tem condições de uso de dados incompatíveis com o envio indiscriminado de memória pessoal. Usar dados fictícios na avaliação inicial. Antes de habilitar memória real na nuvem, registrar o provedor, os controles e a política aplicável; bloquear o envio quando incompatível. [S3]

Groq disponibiliza controles de retenção e declara não treinar com entradas/saídas sem autorização. Isso a torna candidata para a etapa pessoal, sem eliminar a necessidade de conferir as configurações e termos. [S6]

Separar fatos em locais e elegíveis para envio. Essa classificação também deve valer para histórico, resumos, texto digitado, transcrições e imagens: filtrar apenas a tabela de fatos não protege uma conversa. Uma política que não permita o conteúdo deve bloquear o envio ou direcionar para um modelo local compatível, nunca transmitir silenciosamente. Banco local não significa inferência privada.

### 4.3 Orçamento de uso

Contabilizar requisições, tokens de entrada/saída e de raciocínio quando informados, imagens e trabalhos de memória. Cotas se aplicam também a resumos e testes. Não presumir que cache existe ou reduz a cota: confirmar no adaptador.

Exemplo de dimensionamento, não de consumo medido: quatro respostas por minuto com 3.000 tokens de entrada consomem 12.000 tokens/minuto antes das saídas. Os limites publicados para Qwen 3.8 27B no Groq incluem 8.000 tokens/minuto e 200.000/dia; confirmar os valores efetivos da conta. [S5]

Reservar cota para conversa ativa, adiar jobs de memória quando necessário, limitar contexto e exibir aviso de esgotamento. Respeitar Retry-After; tentativas limitadas não devem produzir resposta duplicada. Trocar de provedor somente entre turnos, dentro da política de dados e das capacidades exigidas. Nunca ativar cobrança ou trocar para modelo pago automaticamente.

## 5. Personalidade, emoção e voz natural

### 5.1 Princípio

Personalidade não é um rótulo de emoção anexado ao fim da resposta. Ela aparece no que a personagem percebe, decide dizer, omite e como reage ao histórico. A expressão final combina quatro elementos:

1. **Persona estável:** racional, curiosa, direta, humor seco e afeto discreto, com exemplos positivos e negativos.
2. **Intenção contextual:** explicar, provocar de leve, acolher, discordar, demonstrar curiosidade ou reconhecer um erro.
3. **Realização vocal:** identidade da voz, ritmo, pausas, energia e ênfase que o TTS realmente consegue produzir.
4. **Atuação visual:** olhar, sobrancelhas, cabeça, postura e boca sincronizados com o áudio.

O prompt deve favorecer conversa em pt-BR, respostas curtas por padrão, explicações longas sob pedido, sarcasmo moderado e respeito ao estado da conversa. Evitar bordões repetitivos, hostilidade automática e gagueira em toda frase. Não inventar lembranças nem afirmar ser uma pessoa humana real.

### 5.2 Estado expressivo e segmentos

Manter um estado leve por sessão: emoção predominante, intensidade e intenção do turno. A emoção deve transitar gradualmente; não alternar entre irritação e euforia por frase sem motivo. Usar intensidades baixas como padrão. A LLM propõe expressão, e uma política determinística limita valores e mudanças bruscas.

Cada segmento falado recebe metadados internos validados:

```json
{
  "responseId": "r_42",
  "segmentId": "s_2",
  "spokenText": "Você podia ter começado por essa parte. Agora faz sentido.",
  "intent": "provocacao_afetuosa",
  "emotion": "ironia_leve",
  "intensity": 0.3,
  "voiceProfileId": "amadeus_ptbr_v1",
  "deliveryPresetId": "seco_suave_v1",
  "avatarExpression": "sorriso_discreto"
}
```

Esses campos pertencem ao contrato da Amadeus, não são parâmetros nativos prometidos pelo Chatterbox. A voz nunca deve ler nomes de emoções, JSON, raciocínio interno ou instruções de atuação.

### 5.3 Como o Chatterbox será dirigido

Selecionar uma referência vocal original ou de uma pessoa que autorizou o uso, com gravação limpa em pt-BR. Fixar identidade, versão e perfil. Comparar Chatterbox Multilingual e variante pt-BR quando disponíveis no ambiente. [S8]

Criar presets por escuta, combinando apenas controles disponíveis na versão instalada:

- Redação e pontuação naturais; frases com contexto suficiente para conservar prosódia.
- Pausas entre segmentos controladas pelo reprodutor, sem inserir instruções faladas.
- Parâmetros como exaggeration e cfg_weight, se suportados pelo adaptador, ajustados dentro de faixas testadas.
- Referências expressivas da mesma voz como experimento opcional; manter apenas se preservarem identidade e melhorarem a atuação.

Não existe correspondência garantida entre exaggeration e uma emoção específica. O parâmetro pode alterar intensidade e ritmo, sem produzir sarcasmo ou constrangimento. Não enviar tags como [laugh] sem comprovar suporte na variante em português. [S8]

### 5.4 Exemplos de direção, sujeitos à validação

| Situação | Texto proposto | Direção vocal desejada | Live2D |
| --- | --- | --- | --- |
| Curiosidade científica | "Espera. Você mediu isso ou está supondo?" | Pergunta clara, leve ênfase e pausa breve | Olhar atento, inclinação discreta |
| Provocação afetuosa | "Uma ideia brilhante. Faltou só testar antes." | Tom seco, sem agressividade | Sorriso discreto, sobrancelha elevada |
| Elogio recebido | "Obrigada... Eu só queria que desse certo." | Pequena hesitação, energia mais baixa | Olhar lateral e expressão suave |
| Preocupação | "Você parece cansado. Quer me contar o que aconteceu?" | Ritmo calmo e fala acolhedora | Olhar estável, movimentos reduzidos |

Esses exemplos são alvos de atuação, não resultados já alcançados. Texto e avatar ajudam a comunicar emoção, mas não substituem uma voz expressiva.

### 5.5 Gate de qualidade vocal

Avaliar pelo menos 30 falas cobrindo neutralidade, curiosidade, alegria discreta, irritação leve, constrangimento e preocupação. Ouvir os áudios sem avatar primeiro, com três gerações por fala, registrando versão, referência e preset.

Critério inicial proposto: média de pelo menos 4/5 em naturalidade, identidade e adequação à personagem; intenção reconhecida em pelo menos 80% dos casos por avaliação do usuário, com a matriz de confusões registrada. Depois conferir coerência com o avatar. Esses limiares são metas de produto, não promessas do modelo nem estimativas estatísticas de uma população.

Se o Chatterbox falhar, testar outro TTS capaz de preservar a voz personalizada. Se necessário, avaliar adaptação do modelo com material autorizado. Isso mantém o requisito; não declarar a fase concluída apenas porque o avatar parece emocionado. Comparar identidade e naturalidade antes de aumentar a intensidade.

### 5.6 Emoção sem bloquear a primeira fala

Produzir unidades estruturadas curtas por segmento, validadas antes da síntese; não aguardar um JSON gigante com a resposta completa. O adaptador deve testar extração incremental segura de segmentos. Se metadados atrasarem, usar o estado expressivo anterior ou neutro e atualizar no próximo segmento, sem reclassificação bloqueante adicional.

O início do áudio depende apenas da primeira unidade válida. Uma expressão atrasada nunca deve ser aplicada ao segmento errado. Sincronizar pelo segmento efetivamente reproduzido.

## 6. Sessões, protocolo e interrupções

### 6.1 Estado e concorrência

Separar estado da conexão (connecting, connected, reconnecting, closed) do turno (idle, listening, thinking, speaking, cancelling, error). speaking descreve áudio reproduzido no cliente; geração pode continuar em paralelo. Nova fala durante thinking também cancela uma resposta obsoleta.

Permitir apenas uma resposta ativa por sessão. Texto ou imagem durante a fala é incorporado a um novo turno após cancelamento explícito ou colocado em espera, conforme ação da interface; nunca gerar duas respostas concorrentes por acidente.

### 6.2 REST

| Método | Rota | Uso |
| --- | --- | --- |
| GET | /v1/health | Estado mínimo; detalhes protegidos |
| POST / GET | /v1/conversations | Criar/listar conversas |
| GET / DELETE | /v1/conversations/:id | Histórico/exclusão |
| POST | /v1/conversations/:id/messages | Texto e referências de imagem; streaming via fetch/SSE |
| POST | /v1/conversations/:id/call-tickets | Ticket curto, de uso único, para abertura autenticada do WS |
| POST | /v1/uploads/images | Upload validado |
| GET | /v1/facts | Consultar fatos |
| PATCH / DELETE | /v1/facts/:id | Corrigir/esquecer um fato |
| GET | /v1/capabilities | Capacidades habilitadas de STT, LLM, TTS e avatar |
| GET | /v1/usage | Consumo estimado e limites configurados/conhecidos |
| GET | /v1/openapi.json | Contrato REST |

O navegador não deve receber a chave do provedor. Para WebSocket, validar ticket, origem e proprietário da conversa; evitar credenciais duradouras em URLs. Redigir logs para que nem tickets apareçam. Documentar expiração, uso único e autenticação da reconexão.

### 6.3 WebSocket

Canal /v1/conversations/:id/call. Envelope de controle com protocolVersion, sessionId, responseId, segmentId, seq e tipo, conforme evento. Frames de áudio binários associados aos mesmos identificadores.

| Direção | Eventos | Finalidade |
| --- | --- | --- |
| Cliente para API | audio.chunk, speech.start, speech.end | Áudio e detecção de fala |
| Cliente para API | text.send, image.send, interrupt | Novas entradas e cancelamento |
| Cliente para API | playback.progress, playback.ended | Segmento e posição aproximada efetivamente reproduzidos |
| Cliente para API | session.resume | Retomar contexto com novo ticket e último evento confirmado |
| API para cliente | state, transcript.partial, transcript.final | Estado e legendas |
| API para cliente | reply.text, reply.expression, audio.chunk | Texto, atuação e áudio por segmento |
| API para cliente | reply.done, interrupted, quota.warning, error | Finalização e falhas |

reply.done significa geração terminada; playback.ended significa reprodução terminada. Registrar ambos. Fixar o formato negociado de áudio, canais, sample rate, duração máxima de chunk, ordem e limites de buffer no contrato antes da implementação.

### 6.4 Cancelamento e retomada

O cliente silencia e invalida responseId localmente. A API cancela LLM/TTS quando suportado; quando não há cancelamento cooperativo, descarta resultados, limita o trabalho pendente e pode reciclar o worker. A conexão não deve reproduzir chunks de uma resposta invalidada após retomada.

Persistir separadamente texto gerado, segmentos sintetizados e posição de reprodução confirmada pelo cliente. Confirmação indica reprodução aproximada, não prova de percepção humana. Quando não houver alinhamento de palavras, guardar posição e marcar o trecho como parcial/incerto. A memória não presume que a resposta inteira foi ouvida.

## 7. Persistência e memória

- Curto prazo: mensagens recentes limitadas por tokens, sem incluir trabalho cancelado como resposta entregue.
- Resumos: checkpoints durante chamadas longas e ao encerrar; trabalho persistente, reexecutável sem duplicar fatos.
- Fatos: texto, origem, data, versão, categoria, status (declarado/inferido/confirmado) e permissão de envio.
- Recuperação: busca textual, recência e categorias; embeddings e banco vetorial adiados.

Uma inferência não vira automaticamente um fato confirmado. Correções explícitas prevalecem e mantêm rastreabilidade. Exclusão de conversa invalida resumos e fatos derivados apenas dela; fatos com outras fontes são recalculados ou apresentados para decisão do usuário.

Esquecer um fato remove/invalida suas cópias derivadas e impede reextração automática da fonte ainda existente. A operação deve informar se o histórico original permanece; para apagar o dado também do histórico, remover/redigir as mensagens e atualizar resumos. Testar que o fato não reaparece após reinício ou reconstrução da memória.

Jobs guardam estado, tentativas, prazo e chave de idempotência. Salvar mensagem e agendar trabalho de forma transacional quando necessário. Backup deve ser consistente com SQLite e seus arquivos associados; não copiar apenas um arquivo em uso sem considerar o estado do banco. Validar restauração.

## 8. Live2D e aplicativo desktop

### 8.1 Live2D faz parte da entrega

Selecionar ou produzir arte e rig utilizáveis no projeto. Definir parâmetros reais do modelo e mapear as expressões aprovadas; não assumir nomes de parâmetros universais. Implementar piscar, olhar, movimentos sutis de cabeça e respiração. Limitar intensidade e transições para evitar atuação mecânica.

Lip-sync inicial usa amplitude do áudio que está sendo reproduzido, com suavização. Encerrar movimento da boca ao interromper ou limpar o buffer. Visemas podem ser incorporados se o TTS oferecer alinhamento utilizável, sem serem requisito para o primeiro aceite de Live2D.

Validar recursos do SDK e condições de distribuição na seleção dos assets. Medir desempenho do avatar junto com o áudio; animação não pode causar cortes na fala.

### 8.2 Desktop faz parte da entrega

Empacotar o mesmo cliente com Tauri para Windows. A primeira versão desktop conecta à API configurada; o serviço de áudio e seus modelos são instalados/iniciados conforme instruções próprias. Não presumir que o instalador Tauri inclui automaticamente Python, CUDA, modelos ou servidor.

Entregar instalador, instruções de backend/voz e configuração da conexão. Testar permissões do microfone, dispositivos, reprodução, Live2D, reinício e reconexão no aplicativo instalado. Empacotamento totalmente autônomo dos modelos só será decidido após medir tamanho e dependências; a entrega desktop conectada permanece obrigatória.

## 9. Imagens, segurança e falhas

Aceitar JPEG, PNG e WebP, com teto inicial de 10 MB e limite configurado de dimensões/pixels decodificados. Validar conteúdo real, remover EXIF e controlar a propriedade de cada arquivo. Aplicar também os limites menores do provedor e tratar o custo de tokens das imagens.

Autenticação básica desde a fundação. A API só aceita acesso aos dados do proprietário; administração multiusuário fica adiada. Usar HTTPS/WSS fora de localhost, inclusive ao expor na rede local. Chaves no servidor, origem permitida, limites de payload, sessões e buffers. Não registrar conversas, áudios ou credenciais em logs técnicos por padrão.

| Falha | Comportamento |
| --- | --- |
| STT indisponível | Oferecer texto digitado; manter a voz personalizada de saída se TTS funcionar |
| TTS indisponível | Mostrar texto e avisar; preservar a identidade vocal ao recuperar, sem trocar por voz genérica |
| LLM/cota indisponível | Avisar; tentar alternativa configurada e compatível entre turnos ou aguardar |
| Rede caiu | Silenciar resposta inválida e retomar contexto, sem reproduzir áudio antigo |
| Metadado de emoção inválido | Usar expressão neutra/anterior; registrar falha técnica sem bloquear a fala |

Texto é recuperação temporária quando a voz falha; não satisfaz o aceite de voz personalizada. Nenhuma dependência gratuita recebe promessa de disponibilidade mensal.

## 10. Medição e critérios de aceite

| Métrica | Definição | Meta inicial |
| --- | --- | --- |
| Resposta audível | Fim real da fala do usuário até primeiro áudio reproduzido; inclui VAD | p50 até 2 s; p95 registrado e investigado, sem teto prometido antes do benchmark |
| Interrupção | Início da nova fala até silêncio efetivo no dispositivo | p95 até 500 ms em ensaio controlado; todo áudio obsoleto deve ser descartado |
| Qualidade vocal | Escuta sem avatar: naturalidade, identidade e atuação | Média 4/5 e intenção reconhecida em 80% do conjunto |
| Persona/visão | 30 cenários comuns por modelo, com rubrica fixa | Média 4/5 em persona e naturalidade; erros factuais e visuais registrados separadamente |
| Memória | Correção, exclusão, reconstrução e reinício | Nenhum fato apagado reintroduzido nos casos de teste |

Executar ao menos 100 turnos de latência e 30 interrupções no ambiente-alvo. Registrar aquecimento, uso de fone/alto-falante, rede, ruído, versões, duração das falas, p50/p95, erros e pico de RAM/VRAM. Separar partida fria de operação aquecida e testar Live2D ativo. O relógio do cliente mede a experiência final; durações internas usam relógios monotônicos de cada processo, sem subtrair horários de máquinas não sincronizadas.

Registrar tempo até primeira frase utilizável, tempo de síntese, início da reprodução e capacidade de gerar áudio mais rápido que sua reprodução. Streaming HTTP, geração incremental do modelo e segmentação por frases são capacidades diferentes. Declarar qual foi implementada e medida.

As metas são propostas de aceite; não há resultado de benchmark nesta revisão. Se falharem, otimizar ou trocar componentes preservando voz personalizada e escopo aprovado.

## 11. Fases revisadas

Não fixar datas antes dos testes de áudio, da disponibilidade do rig Live2D e da seleção da referência vocal. A ordem abaixo define dependências e entregas, não adiamentos de escopo.

| Fase | Trabalho | Saída verificável |
| --- | --- | --- |
| 0. Fundação | Monorepo, contratos, health, SQLite, autenticação básica, configuração, capacidades e logs | API e cliente mínimo executam; acesso indevido rejeitado |
| 1. Voz personalizada de ponta a ponta | Serviço Python, referência vocal, STT, LLM, TTS, VAD, interrupção, reprodução confirmada e medição | Chamada funciona; perfil vocal preservado; baseline de latência/cotas/VRAM documentado |
| 2. Persona e atuação | Prompt, estado expressivo, segmentos, presets vocais e conjunto de avaliação | 30 cenários; gate de voz sem avatar; escolha justificada de TTS/LLM |
| 3. Memória e recuperação | Checkpoints, jobs duráveis, origem/correção/exclusão de fatos, políticas de envio, retomada | Reinício recupera trabalhos; memória correta e exclusão efetiva |
| 4. Texto e imagens | Upload, EXIF, mensagens durante chamadas, validação multimodal | Imagem e texto recebem resposta coerente e entram no histórico |
| 5. Live2D e interface completa | Arte/rig, atuação sincronizada, legendas, histórico, fatos e configurações | Avatar Live2D final funciona com voz, emoção e interrupção |
| 6. Desktop | Tauri, instalador Windows, configuração e instruções dos serviços | Aplicativo instalado usa microfone, voz personalizada, Live2D e memória |
| 7. Integração e entrega | Docker, contratos REST/WS, testes de falhas, backup/restauração, ensaio completo | Relatório de aceite, documentação e pacote desktop entregues |

Live2D pode ser preparado em paralelo às avaliações de áudio; o projeto não termina na fase 1 ou 2. É necessário concluir as fases 5 e 6 para atender ao escopo aprovado.

### 11.1 Requisitos implementados em cada fase

Os IDs abaixo correspondem à lista de requisitos aprovada em Requisitos_API_Amadeus_v2.pdf. Cada um dos **67 requisitos ativos** tem uma fase responsável por sua implementação principal. Requisitos que atravessam várias funcionalidades são ampliados e revalidados nas fases seguintes, conforme a seção 11.2; sua presença na tabela não significa que todos os testes de integração possam ser concluídos antecipadamente.

| Fase | Requisitos funcionais | Requisitos não funcionais |
| --- | --- | --- |
| **0. Fundação** | RF-001, RF-002: autenticação e rejeição de acesso inválido. RF-030: configuração dos adaptadores. RF-031: contratos REST e voz. RF-032: saúde. RF-043: consulta de capacidades e consumo. | RNF-001: isolamento dos dados. RNF-002: segredos. RNF-005: validação. RNF-010: transporte seguro. RNF-011: versionamento. RNF-015: estrutura e primeiros testes automatizados. RNF-021: política de dados. RNF-024: declaração de capacidades reais. |
| **1. Voz personalizada de ponta a ponta** | RF-004, RF-005: início e encerramento da chamada. RF-006, RF-007, RF-008, RF-009: envio, detecção e transcrição da fala. RF-010, RF-011, RF-012, RF-013, RF-014: geração, síntese, reprodução, interrupção e estados. RF-024: persistência durante a chamada. RF-029: configuração da voz. RF-033: logs e métricas. RF-039: reprodução parcial. RF-041: cotas e alternativas. | RNF-003, RNF-004: latência e interrupção. RNF-008: limites de consumo. RNF-012: continuidade diante de falhas. RNF-019: uso de memória e processamento. RNF-020: prevenção de efeitos duplicados. |
| **2. Persona e atuação** | RF-018, RF-019: aplicação e configuração da persona. RF-020, RF-021: emoção por segmento e sincronização dos eventos. RF-034: versões dos perfis vocais. RF-035: atuação vocal. RF-044: avaliação dos modelos e da voz. | RNF-017: identidade da voz personalizada. RNF-018: naturalidade e adequação emocional. |
| **3. Memória e recuperação** | RF-022, RF-023: gerenciamento e histórico das conversas. RF-025, RF-026, RF-027, RF-028: resumos, extração, recuperação, correção e exclusão de fatos. RF-040: recuperação das tarefas de memória. RF-042: controle dos dados enviados à nuvem. RF-045: retomada da chamada. | RNF-009: persistência, backup e restauração completos. RNF-013: reconexão sem duplicação. |
| **4. Texto e imagens** | RF-015: texto dentro e fora da chamada. RF-016, RF-017: envio e interpretação de imagens. | RNF-006: limites das imagens. RNF-007: remoção de metadados. |
| **5. Live2D e interface completa** | RF-036: avatar Live2D. RF-037: sincronização da boca. Integração na interface final dos recursos já implementados de legendas, expressão, histórico, fatos e configurações. | RNF-022: fluidez e sincronização do Live2D. |
| **6. Desktop** | RF-038: aplicativo Windows empacotado com Tauri e instruções dos serviços. | RNF-023: funcionamento após instalação, incluindo dispositivos, chamada e Live2D. |
| **7. Integração e entrega** | Validação integrada de todos os RF ativos das fases anteriores; consolidação da documentação RF-031 e do relatório de operação RF-033. | RNF-014: execução documentada do backend em contêiner. Validação final de todos os RNF ativos, com testes completos, recuperação, restauração e desempenho. |

### 11.2 Complementos e validações entre fases

- **Segurança, contratos e testes:** RF-001, RF-002, RF-030, RF-031, RF-043 e RNF-001, RNF-002, RNF-005, RNF-010, RNF-011, RNF-015, RNF-021 e RNF-024 começam na fase 0. Cada nova rota, adaptador, modalidade e cliente deve estender essas proteções, contratos e testes na fase em que for acrescentado. Capacidades e consumo inicialmente podem ter dados mínimos, ampliados com a integração real dos provedores.
- **Encerramento e memória:** na fase 1, RF-005 e RF-024 salvam a chamada e deixam registrado o trabalho de memória pendente. A fase 3 implementa seu processamento e recuperação completos com RF-025 e RF-040; o aceite integral do encerramento com memória ocorre nessa fase.
- **Contexto da resposta:** RF-010 usa contexto recente e uma persona inicial na fase 1. A fase 2 valida a personalidade; a fase 3 incorpora a memória persistente permitida de RF-027.
- **Privacidade desde a primeira chamada:** a política de RNF-021 já deve impedir envio incompatível na fase 0. A fase 1 usa dados fictícios na avaliação dos provedores. A fase 3 completa RF-042 para histórico, resumos e fatos; a fase 4 estende o controle a imagens e aos fluxos completos de texto. Não esperar pela fase 3 para proteger o conteúdo enviado.
- **Texto como recuperação:** RNF-012 exige uma entrada mínima de texto e exibição da resposta já na fase 1 para tratar falhas de STT/TTS. RF-015 é concluído na fase 4, com os fluxos completos dentro e fora da chamada.
- **Cotas, métricas e duplicação:** RF-033, RF-041 e RNF-008, RNF-019, RNF-020 são ampliados na fase 3 para jobs e retomada, na fase 4 para imagens, e nas fases 5 e 6 para os clientes completos.
- **Expressão e avatar:** a fase 2 entrega os metadados sincronizados de RF-021 e os presets de voz. A fase 5 completa sua apresentação no Live2D, junto de RF-036 e RF-037. O teste vocal sem avatar permanece obrigatório na fase 2.
- **Qualidade e latência:** RF-044 e RNF-017, RNF-018 são avaliados na fase 2; os cenários visuais são completados na fase 4. RNF-003 e RNF-004 têm medições iniciais na fase 1 e validação com Live2D ativo na fase 5. A fase 6 repete os ensaios no desktop instalado; a fase 7 consolida os resultados finais, incluindo RNF-019 e RNF-022.
- **Entrega completa:** a fase 7 verifica os 67 requisitos ativos. Uma fase intermediária pode terminar com complementos explicitamente previstos acima; a entrega final só é aceita após sua conclusão e a validação dos critérios aplicáveis.

### 11.3 Requisitos adiados

**RF-003** (administração completa de múltiplos clientes) e **RNF-016** (garantia de 95% de disponibilidade mensal) não entram em nenhuma fase de implementação desta versão. Continuam identificados na lista para rastreabilidade. Embeddings e banco vetorial também permanecem adiados, sem ID próprio na lista atual; a memória da fase 3 usa busca textual.

## 12. Riscos e decisões ainda dependentes de teste

- Voz pouco expressiva: comparar presets e referências; trocar TTS se necessário, mantendo identidade.
- Latência alta: medir antes de otimizar, ajustar tamanho de segmentos, VAD e execução; não prometer streaming que não existe.
- Cota insuficiente: contexto compacto, reserva de capacidade, jobs adiáveis e alternativa configurada.
- Persona variável ao trocar modelo: preservar prompt versionado e validar o mesmo conjunto; trocar entre turnos.
- Emoção e áudio fora de sincronia: agendar expressão pelo segmento reproduzido, não pela chegada do evento.
- Privacidade: política efetiva de toda a entrada enviada; dados locais não bastam.
- Desktop com dependências pesadas: documentar instalação dos serviços e validar em Windows com o pacote instalado.
- Exclusão incompleta: rastrear fontes e derivados e testar reconstrução da memória.

Pendências concretas: obter/selecionar referência vocal, escolher assets Live2D, confirmar cotas das contas, executar avaliações, fixar versões e aprovar presets. Essas pendências não foram realizadas pela atualização documental.

## 13. Rastreabilidade e histórico da revisão

O documento Requisitos_API_Amadeus_v2.pdf preserva os IDs RF-001 a RF-033 e RNF-001 a RNF-016, atualiza suas descrições e acrescenta requisitos de voz, atuação, Live2D, desktop, memória e operação. Embora o nome histórico contenha API, os requisitos novos identificam explicitamente responsabilidades do cliente e dos serviços locais.

RF-003 e RNF-016 permanecem identificados como adiados, sem remoção ou renumeração. Embeddings/banco vetorial são registrados como item adiado de planejamento, pois não possuíam ID próprio no PDF original.

Mudanças centrais da versão 2.0: voz personalizada obrigatória; pipeline separado confirmado; LLM na nuvem para avaliação; SQLite definido; VAD/interrupção/autenticação antecipados; jobs duráveis; memória com origem e exclusão de derivados; política de cotas e dados; Live2D e desktop com fases e aceite explícitos.

Atualização 2.1: vinculação dos 67 requisitos ativos às fases, com responsabilidades de implementação e validações posteriores explícitas. Remoção da seção 4.4 e das referências de escopo solicitadas. IDs, prioridades e formato da lista de requisitos preservados.

## 14. Fontes e validade das informações externas

Consultadas em 02/10/2026. Ofertas, modelos, cotas e termos podem mudar. As escolhas de arquitetura e os limiares de qualidade são decisões deste projeto, não garantias dos fornecedores.

- [S1 - Gemini 3.8 Flash: capacidades](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [S2 - Gemini: preços](https://ai.google.dev/gemini-api/docs/pricing) e [limites efetivos](https://ai.google.dev/gemini-api/docs/rate-limits)
- [S3 - Gemini: condições de uso de dados](https://ai.google.dev/gemini-api/terms)
- [S4 - NVIDIA: Kimi K3](https://build.nvidia.com/moonshotai/kimi-k3/modelcard)
- [S5 - Groq: limites](https://console.groq.com/docs/rate-limits), [visão](https://console.groq.com/docs/vision) e [raciocínio](https://console.groq.com/docs/reasoning)
- [S6 - Groq: dados](https://console.groq.com/docs/your-data) e [acordo](https://console.groq.com/docs/legal/services-agreement)
- [S7 - OpenRouter: limites](https://openrouter.zendesk.com/hc/en-us/articles/39501163636379-OpenRouter-Rate-Limits-What-You-Need-to-Know)
- [S8 - Chatterbox: modelos, exemplos e parâmetros](https://github.com/resemble-ai/chatterbox)
- [S9 - faster-whisper: transcrição e integrações](https://github.com/SYSTRAN/faster-whisper)
- [S10 - Gemini Live: capacidades de referência](https://ai.google.dev/gemini-api/docs/live-api)
