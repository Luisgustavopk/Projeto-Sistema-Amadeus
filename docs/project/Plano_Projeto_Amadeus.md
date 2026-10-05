# Projeto Amadeus: plano de desenvolvimento

**Versão 2.8 | 5 de outubro de 2026 | Status: fase 0 implementada; fase 1 com aceite funcional provisório e ensaio físico pendente; fase 2 com voz aceita e pendências textuais; base operacional da fase 3 implementada, com validação de uso pessoal pendente**

## 1. Objetivo e decisões aprovadas

Construir uma Amadeus inspirada na personalidade da Kurisu de Steins;Gate: conversa por voz em português brasileiro, memória entre conversas, texto, imagens e um avatar Live2D. A experiência deve parecer uma ligação: ouvir, responder e aceitar interrupções sem exigir um botão a cada fala.

O objetivo de assistente pessoal combina personalidade persistente com memória consultável, mas não pressupõe treinar o modelo com todas as conversas. Histórico, memórias recuperáveis e pesos de um modelo ajustado são mecanismos distintos, com controles e ciclos de vida próprios. Rotinas proativas de NPC são uma extensão a especificar e aprovar; não fazem parte dos 67 requisitos ativos até a aprovação de critérios de comportamento, permissões e notificações.

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

| Item adiado                                  | Solução desta versão                                                                                                    | Condição para reavaliar                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Embeddings e banco vetorial                  | Fatos selecionados por categoria, recência, palavras-chave e busca textual; resumos limitados por orçamento de contexto | Busca textual deixar de recuperar memórias relevantes nos testes |
| Administração completa de múltiplos clientes | Uso pessoal, proprietário único, credencial básica e sessões autenticadas; emissão e revogação simples                  | Necessidade real de gerenciar vários clientes ou usuários        |
| Garantia de 95% de disponibilidade mensal    | Medir falhas e disponibilidade sem compromisso mensal; tratar quedas e reinícios                                        | Hospedagem contínua e dependências com capacidade previsível     |

## 2. Arquitetura e responsabilidades

```text
Microfone -> cliente (AEC + VAD) -> WebSocket -> STT local
                                                  |
Persona + memória relevante autorizada -> LLM compatível -> segmentos falados
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

O VAD abre uma captura candidata e mantém a resposta atual tocando. Durante uma resposta ativa, a API reconhece palavras em snapshots a partir de 800 ms de captura, com uma consulta antecipada por vez. Uma prévia com palavras confirma a interrupção e preserva a captura; a transcrição final da frase completa é o único texto usado para iniciar o próximo LLM. Sem prévia válida, a transcrição final continua confirmando a troca. Ruído sem transcrição e falhas recuperáveis de STT preservam a resposta. O VAD usa limiar RMS de 0,025, confirmação e pre-roll de 160 ms e silêncio final de 300 ms. Captura, reconhecimento e resposta têm identificadores independentes; uma transcrição atrasada não deve apagar outra captura. O botão de interrupção manual permanece imediato. Validar fala normal/baixa, eco e ruído no microfone real.

Hooks como useCall, useChat e useAvatar coordenam a interface. TanStack Query atende dados do servidor; estado efêmero da chamada fica em um controlador próprio/Zustand. Os clientes web e desktop compartilham componentes e contrato.

### 2.3 Pipeline escolhido e alternativas

O pipeline separado é uma decisão de produto: permite preservar a voz personalizada ao trocar a LLM. Modelos de voz direta não são incapazes de usar persona ou memória, mas uma voz pronta não atende ao requisito essencial desta versão.

Gemini Live deixa de ser um caminho concorrente de implementação obrigatória. Pode servir como referência opcional de fluidez em testes com dados fictícios, sem substituir o pipeline aprovado nem condicionar a entrega. Não há compromisso de construir dois sistemas de voz.

## 3. Stack e organização

| Área               | Escolha                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| API                | Node.js LTS, TypeScript, Fastify, Zod, OpenAPI                                                                                 |
| Transporte         | REST para recursos; WebSocket para chamada, áudio e eventos                                                                    |
| Persistência       | SQLite + Drizzle; migrações; arquivos locais                                                                                   |
| Tarefas de memória | Tabela persistente de jobs, worker, tentativas limitadas e recuperação no reinício                                             |
| Serviços de áudio  | Python; faster-whisper como candidato de STT; Qwen3-TTS Base 1.7B selecionado provisoriamente para TTS após avaliação auditiva |
| Interface          | React + Vite + TypeScript; AudioWorklet; VAD no cliente                                                                        |
| Avatar             | Live2D; mapeamento de expressões e movimentos versionado                                                                       |
| Desktop            | Tauri; Windows como primeiro alvo de validação                                                                                 |
| Qualidade          | Vitest, testes de integração de áudio, ESLint e Prettier                                                                       |
| Execução           | Docker para backend/serviços compatíveis; instalador desktop separado                                                          |

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

| Candidato             | Papel                                                                 | Verificação necessária                                                                      |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gemini 3.8 Flash      | Cérebro inicial para testes com dados fictícios                       | Acesso ao modelo, cotas, latência e compatibilidade da política de dados                    |
| Kimi K3 via NVIDIA    | Comparação de qualidade de raciocínio, persona e visão                | Latência com raciocínio ativo, limites e condições do endpoint de experimentação            |
| Qwen 3.8 27B via Groq | Alternativa com visão, controle de raciocínio e controles de retenção | Qualidade da personagem, cota de tokens e configuração dos controles de dados               |
| OpenRouter gratuito   | Experimentos pontuais                                                 | Cota diária e política do provedor de cada modelo; não usar roteamento aleatório na chamada |

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

### 5.3 Seleção e direção do TTS

Selecionar uma referência vocal original ou de uma pessoa que autorizou o uso, com gravação limpa em pt-BR. Fixar identidade, versão e perfil.

**Decisão de 03/10/2026:** o usuário aprovou provisoriamente a qualidade das duas amostras do Qwen3-TTS Base 1.7B geradas com `amadeus.wav` e sua transcrição como contexto. Essa qualidade é suficiente para prosseguir na etapa atual. Chatterbox Multilingual e sua variante pt-BR foram reprovados para esta referência por artificialidade, pronúncia e distância vocal. O aceite abrange a qualidade vocal isolada. O adaptador Qwen foi integrado ao serviço TTS e validado com o modelo real em CUDA, incluindo autenticação HTTP e saída PCM mono de 16 kHz. O ambiente local está configurado para Qwen, com aplicação no processo habitual após reiniciá-lo no ambiente Python correspondente. Nos testes de integração, a primeira frase levou aproximadamente 10,2 s (incluindo 3,1 s de preparação da referência), e uma segunda frase, diferente, levou 5,8 s com contexto reutilizado. Após otimização com CUDA Graphs, reutilização do filtro de tokens e aquecimento prévio da referência, o benchmark local com três frases e três sementes reduziu a mediana do TTS de 7.18 s para 1.82 s na RTX 4060. Esses nove testes por modo não incluem STT, Gemini ou reprodução. A meta de latência ponta a ponta e o benchmark de 100 turnos permanecem pendentes.

**Refinamento na fase 2:** ajustes adicionais de timbre, prosódia, entonação, naturalidade em pt-BR e expressividade ficam para Persona e atuação, com RF-034, RF-035, RF-044, RNF-017 e RNF-018. Preservar a referência e a configuração aceitas como comparação antes de experimentar mudanças.

Criar presets por escuta, combinando apenas controles disponíveis na versão instalada:

- Redação e pontuação naturais; frases com contexto suficiente para conservar prosódia.
- Pausas entre segmentos controladas pelo reprodutor, sem inserir instruções faladas.
- Controles suportados pelo motor selecionado, ajustados dentro de faixas testadas. `exaggeration` e `cfg_weight` foram usados nas avaliações do Chatterbox e não são presumidos como controles do Qwen3-TTS Base.
- Referências expressivas da mesma voz como experimento opcional; manter apenas se preservarem identidade e melhorarem a atuação.

Não existe correspondência garantida entre exaggeration e uma emoção específica. O parâmetro pode alterar intensidade e ritmo, sem produzir sarcasmo ou constrangimento. Não enviar tags como [laugh] sem comprovar suporte na variante em português. [S8]

### 5.4 Exemplos de direção, sujeitos à validação

| Situação               | Texto proposto                                         | Direção vocal desejada                    | Live2D                                |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------- | ------------------------------------- |
| Curiosidade científica | "Espera. Você mediu isso ou está supondo?"             | Pergunta clara, leve ênfase e pausa breve | Olhar atento, inclinação discreta     |
| Provocação afetuosa    | "Uma ideia brilhante. Faltou só testar antes."         | Tom seco, sem agressividade               | Sorriso discreto, sobrancelha elevada |
| Elogio recebido        | "Obrigada... Eu só queria que desse certo."            | Pequena hesitação, energia mais baixa     | Olhar lateral e expressão suave       |
| Preocupação            | "Você parece cansado. Quer me contar o que aconteceu?" | Ritmo calmo e fala acolhedora             | Olhar estável, movimentos reduzidos   |

Esses exemplos são alvos de atuação, não resultados já alcançados. Texto e avatar ajudam a comunicar emoção, mas não substituem uma voz expressiva.

### 5.5 Gate de qualidade vocal

Avaliar pelo menos 30 falas cobrindo neutralidade, curiosidade, alegria discreta, irritação leve, constrangimento e preocupação. Ouvir os áudios sem avatar primeiro, com três gerações por fala, registrando versão, referência e preset.

Critério inicial proposto: média de pelo menos 4/5 em naturalidade, identidade e adequação à personagem; intenção reconhecida em pelo menos 80% dos casos por avaliação do usuário, com a matriz de confusões registrada. Depois conferir coerência com o avatar. Esses limiares são metas de produto, não promessas do modelo nem estimativas estatísticas de uma população.

Se o Chatterbox falhar, testar outro TTS capaz de preservar a voz personalizada. Se necessário, avaliar adaptação do modelo TTS com material autorizado. Esse trabalho altera ou condiciona a síntese vocal e é diferente de ajustar um LLM para personalidade. Não declarar a fase concluída apenas porque o avatar parece emocionado. Comparar identidade e naturalidade antes de aumentar a intensidade.

### 5.6 Emoção sem bloquear a primeira fala

Produzir unidades estruturadas curtas por segmento, validadas antes da síntese; não aguardar um JSON gigante com a resposta completa. O adaptador deve testar extração incremental segura de segmentos. Se metadados atrasarem, usar o estado expressivo anterior ou neutro e atualizar no próximo segmento, sem reclassificação bloqueante adicional.

O início do áudio depende apenas da primeira unidade válida. Uma expressão atrasada nunca deve ser aplicada ao segmento errado. Sincronizar pelo segmento efetivamente reproduzido.

### 5.7 Experimento opcional de fine-tuning do LLM

A fase 2 estabelece a persona versionada, os exemplos de referência e o conjunto de avaliação da seção 10. Por decisão de 05/10/2026, executar agora ajustes leves no prompt e avançar para a fase 3 com aceite provisório da transição; retomar fine-tuning, módulos cognitivos locais, estado emocional e memória associativa após concluir a fase 3. Consulte [a decisão e suas pendências](../decisions/Decisao_Persona_Fase_3.md). Nos experimentos posteriores, comparar a versão com prompt à versão ajustada usando cenários, modelos-base e critérios equivalentes; registrar também latência, custo, erros factuais e comportamento em situações novas. Um resultado inconclusivo mantém o baseline.

O experimento é opcional e depende de modelo e plataforma compatíveis. Os adaptadores de nuvem atuais atendem inferência; não se presume treinamento na cota gratuita. A restrição aprovada é zero gasto adicional com APIs, treinamento ou GPU em nuvem, usando hardware local e cotas gratuitas. Contabilizar GPU/VRAM, energia, latência, implantação e rollback. A prova de conceito posterior à fase 3 não ativa pesos ajustados em produção; uma adoção exige gate documentado e decisão operacional própria.

Usar apenas material cuja autorização documentada cubra especificamente treinamento, criação de derivados e processamento pela plataforma escolhida. Curar e versionar os exemplos com origem e escopo de uso; separar treino, validação e teste, removendo duplicatas e informações pessoais desnecessárias. Não usar automaticamente o histórico de conversas como corpus. O conjunto de teste deve permanecer fora do treino para evitar avaliar memorização em vez de comportamento generalizável.

Fine-tuning de LLM ensina padrões de resposta, não é a memória consultável do universo nem substitui a recuperação de fatos da fase 3. Adaptação/clonagem do TTS para identidade vocal é outro trabalho, com dados, ferramentas e gates próprios; aprovação de um experimento não implica aprovação do outro.

## 6. Sessões, protocolo e interrupções

### 6.1 Estado e concorrência

Separar estado da conexão (connecting, connected, reconnecting, closed) do turno (idle, listening, thinking, speaking, cancelling, error). speaking descreve áudio reproduzido no cliente; geração pode continuar em paralelo. Durante uma resposta ativa, o VAD abre uma captura candidata sem cancelar reprodução ou geração. Palavras reconhecidas pelo STT, em prévia durante captura ou na transcrição final, confirmam a nova fala e cancelam a resposta obsoleta; áudio sem fala reconhecida mantém a resposta atual.

Permitir apenas uma resposta ativa por sessão. Texto ou imagem durante a fala é incorporado a um novo turno após cancelamento explícito ou colocado em espera, conforme ação da interface; nunca gerar duas respostas concorrentes por acidente.

### 6.2 REST

| Método         | Rota                               | Uso                                                         |
| -------------- | ---------------------------------- | ----------------------------------------------------------- |
| GET            | /v1/health                         | Estado mínimo; detalhes protegidos                          |
| POST / GET     | /v1/conversations                  | Criar/listar conversas                                      |
| GET / DELETE   | /v1/conversations/:id              | Histórico/exclusão                                          |
| POST           | /v1/conversations/:id/messages     | Texto e referências de imagem; streaming via fetch/SSE      |
| POST           | /v1/conversations/:id/call-tickets | Ticket curto, de uso único, para abertura autenticada do WS |
| POST           | /v1/uploads/images                 | Upload validado                                             |
| GET            | /v1/facts                          | Consultar fatos                                             |
| PATCH / DELETE | /v1/facts/:id                      | Corrigir/esquecer um fato                                   |
| GET            | /v1/capabilities                   | Capacidades habilitadas de STT, LLM, TTS e avatar           |
| GET            | /v1/usage                          | Consumo estimado e limites configurados/conhecidos          |
| GET            | /v1/openapi.json                   | Contrato REST                                               |

O navegador não deve receber a chave do provedor. Para WebSocket, validar ticket, origem e proprietário da conversa; evitar credenciais duradouras em URLs. Redigir logs para que nem tickets apareçam. Documentar expiração, uso único e autenticação da reconexão.

### 6.3 WebSocket

Canal /v1/conversations/:id/call. Envelope de controle com protocolVersion, sessionId, responseId, segmentId, seq e tipo, conforme evento. Frames de áudio binários associados aos mesmos identificadores.

| Direção          | Eventos                                       | Finalidade                                                  |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Cliente para API | audio.chunk, speech.start, speech.end         | Áudio e detecção de fala                                    |
| Cliente para API | text.send, image.send, interrupt              | Novas entradas e cancelamento                               |
| Cliente para API | playback.progress, playback.ended             | Segmento e posição aproximada efetivamente reproduzidos     |
| Cliente para API | session.resume                                | Retomar contexto com novo ticket e último evento confirmado |
| API para cliente | state, transcript.partial, transcript.final   | Estado e legendas                                           |
| API para cliente | reply.text, reply.expression, audio.chunk     | Texto, atuação e áudio por segmento                         |
| API para cliente | reply.done, interrupted, quota.warning, error | Finalização e falhas                                        |

reply.done significa geração terminada; playback.ended significa reprodução terminada. Registrar ambos. Fixar o formato negociado de áudio, canais, sample rate, duração máxima de chunk, ordem e limites de buffer no contrato antes da implementação.

### 6.4 Cancelamento e retomada

Na interrupção automática, o cliente mantém a reprodução da resposta atual durante captura e STT. Ao receber `transcript.partial` com palavras ou `transcript.final` não vazio para a captura candidata, silencia/invalida localmente a resposta antiga e a API cancela LLM/TTS quando suportado; `NO_SPEECH_DETECTED` ou erro recuperável de STT descarta apenas a captura e preserva a resposta. A interrupção manual continua imediata. Quando não há cancelamento cooperativo, a API descarta resultados, limita o trabalho pendente e pode reciclar o worker. A conexão não deve reproduzir chunks de uma resposta invalidada após confirmação da fala. Essa semântica reduz falsos cortes, mas adiciona a latência do STT ao barge-in automático; medir esse intervalo separadamente da latência de resposta normal.

Persistir separadamente texto gerado, segmentos sintetizados e posição de reprodução confirmada pelo cliente. Confirmação indica reprodução aproximada, não prova de percepção humana. Quando não houver alinhamento de palavras, guardar posição e marcar o trecho como parcial/incerto. A memória não presume que a resposta inteira foi ouvida.

## 7. Persistência e memória

- Curto prazo: mensagens recentes limitadas por tokens, sem incluir trabalho cancelado como resposta entregue.
- Resumos: checkpoints durante chamadas longas e ao encerrar; trabalho persistente, reexecutável sem duplicar fatos.
- Fatos: texto, origem, data, versão, categoria, status (declarado/inferido/confirmado) e permissão de envio.
- Recuperação: busca textual, recência e categorias; embeddings e banco vetorial adiados.

### 7.1 Memória pessoal não é treinamento

Histórico e memórias são persistidos como dados da aplicação; o LLM não aprende automaticamente nem altera seus pesos a cada conversa. Para preservar controle e permitir correção ou esquecimento:

- Separar histórico bruto, resumos e fatos/memórias recuperáveis, mantendo origem e ligações entre derivados.
- Começar com extração sugerida e confirmação do usuário para fatos pessoais duráveis; permitir consultar, editar, revogar permissão, exportar e apagar.
- Recuperar apenas as memórias pertinentes ao turno e ao orçamento de contexto. Não anexar o arquivo completo de conversas por padrão.
- Aplicar a política de envio também às memórias recuperadas: um dado armazenado localmente não deixa de ser pessoal quando enviado como contexto a um LLM remoto.
- Manter os fatos pessoais fora dos exemplos de treinamento por padrão. Fine-tuning é uma opção posterior para padrões de resposta/atuação, usando um conjunto curado, minimizado e autorizado; não é mecanismo de memória nem mecanismo confiável de esquecimento.

Escolher explicitamente armazenamento local ou remoto, proteção em repouso, backup, retenção e comportamento na exclusão antes de habilitar a memória pessoal em uso real. `personal-approved` autoriza o fluxo da aplicação para um provedor após revisão humana; não é uma garantia de retenção zero, confidencialidade absoluta ou uso de dados do provedor restrito. Verificar os termos e controles efetivos de cada conta e modalidade antes de enviar conteúdo.

Uma inferência não vira automaticamente um fato confirmado. Correções explícitas prevalecem e mantêm rastreabilidade. Exclusão de conversa invalida resumos e fatos derivados apenas dela; fatos com outras fontes são recalculados ou apresentados para decisão do usuário.

Esquecer um fato remove/invalida suas cópias derivadas e impede reextração automática da fonte ainda existente. A operação deve informar se o histórico original permanece; para apagar o dado também do histórico, remover/redigir as mensagens e atualizar resumos. Testar que o fato não reaparece após reinício ou reconstrução da memória.

Jobs guardam estado, tentativas, prazo e chave de idempotência. Salvar mensagem e agendar trabalho de forma transacional quando necessário. Backup deve ser consistente com SQLite e seus arquivos associados; não copiar apenas um arquivo em uso sem considerar o estado do banco. Validar restauração.

### 7.2 Rotina proativa de NPC — extensão a especificar

Uma rotina própria deve ser implementada como eventos e tarefas agendadas, não como uma LLM em execução contínua. Exemplos futuros incluem lembrar um compromisso, retomar um assunto ou iniciar uma interação em uma janela configurada. Antes de implementação, especificar fuso horário, horários silenciosos, frequência, cancelamento, fonte do evento, limites de cota e como a iniciativa aparece ao usuário. Ações externas ou com efeitos duráveis exigem confirmação explícita; toda tarefa deve ser pausável, auditável e removível. Esta extensão não autoriza acesso irrestrito a contas, arquivos ou dispositivos.

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

| Falha                       | Comportamento                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| STT indisponível            | Oferecer texto digitado; manter a voz personalizada de saída se TTS funcionar                  |
| TTS indisponível            | Mostrar texto e avisar; preservar a identidade vocal ao recuperar, sem trocar por voz genérica |
| LLM/cota indisponível       | Avisar; tentar alternativa configurada e compatível entre turnos ou aguardar                   |
| Rede caiu                   | Silenciar resposta inválida e retomar contexto, sem reproduzir áudio antigo                    |
| Metadado de emoção inválido | Usar expressão neutra/anterior; registrar falha técnica sem bloquear a fala                    |

Texto é recuperação temporária quando a voz falha; não satisfaz o aceite de voz personalizada. Nenhuma dependência gratuita recebe promessa de disponibilidade mensal.

## 10. Medição e critérios de aceite

| Métrica          | Definição                                                              | Meta inicial                                                                            |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Resposta audível | Fim real da fala do usuário até primeiro áudio reproduzido; inclui VAD | p50 até 2 s; p95 registrado e investigado, sem teto prometido antes do benchmark        |
| Interrupção      | Início da nova fala até silêncio efetivo no dispositivo                | p95 até 500 ms em ensaio controlado; todo áudio obsoleto deve ser descartado            |
| Qualidade vocal  | Escuta sem avatar: naturalidade, identidade e atuação                  | Média 4/5 e intenção reconhecida em 80% do conjunto                                     |
| Persona/visão    | 30 cenários comuns por modelo, com rubrica fixa                        | Média 4/5 em persona e naturalidade; erros factuais e visuais registrados separadamente |
| Memória          | Correção, exclusão, reconstrução e reinício                            | Nenhum fato apagado reintroduzido nos casos de teste                                    |

Executar ao menos 100 turnos de latência e 30 interrupções no ambiente-alvo. Registrar aquecimento, uso de fone/alto-falante, rede, ruído, versões, duração das falas, p50/p95, erros e pico de RAM/VRAM. Separar partida fria de operação aquecida e testar Live2D ativo. O relógio do cliente mede a experiência final; durações internas usam relógios monotônicos de cada processo, sem subtrair horários de máquinas não sincronizadas.

Registrar tempo até primeira frase utilizável, tempo de síntese, início da reprodução e capacidade de gerar áudio mais rápido que sua reprodução. Streaming HTTP, geração incremental do modelo e segmentação por frases são capacidades diferentes. Declarar qual foi implementada e medida.

As metas são propostas de aceite; existem ensaios parciais, mas ainda não há benchmark completo de aceite físico. O coletor usa mediana de 2 s para resposta e p95 de 500 ms para interrupção automática. A duração da pergunta e as paradas manuais são diagnósticos, não gates de resposta. O navegador estima o fim da fala e o agendamento do áudio; nunca confirma sozinho saída física. A interrupção automática medida pelo cliente começa na detecção do VAD, excluindo o atraso anterior de confirmação do início: esse atraso e o silêncio efetivo devem ser medidos externamente. O fluxo atual reconhece palavras em snapshots durante a captura, a partir de 800 ms, preservando a frase completa para a transcrição final. A janela inicial e o tempo de STT ainda não garantem a meta de 500 ms desde o início acústico. O reconhecimento antecipado limita-se à resposta ativa e não acrescenta consultas durante uma pergunta ociosa. A meta original não foi relaxada. Se falharem, otimizar ou trocar componentes preservando voz personalizada e escopo aprovado.

## 11. Fases revisadas

Não fixar datas antes dos testes de áudio, da disponibilidade do rig Live2D e da seleção da referência vocal. A ordem abaixo define dependências e entregas, não adiamentos de escopo.

| Fase                                  | Trabalho                                                                                                                                                                                                                                                                            | Saída verificável                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0. Fundação                           | Monorepo, contratos, health, SQLite, autenticação básica, configuração, capacidades e logs                                                                                                                                                                                          | API e cliente mínimo executam; acesso indevido rejeitado                                                                                                                                   |
| 1. Voz personalizada de ponta a ponta | Serviço Python, referência vocal, STT, LLM, TTS, VAD, interrupção, reprodução confirmada e medição                                                                                                                                                                                  | Chamada funciona; perfil vocal preservado; baseline de latência/cotas/VRAM documentado                                                                                                     |
| 2. Persona e atuação                  | Especificação e prompt versionados da personagem, estado expressivo, segmentos, presets vocais, refinamento de timbre/prosódia/naturalidade da voz provisória e conjunto de avaliação; experimentos avançados para estilo/comportamento após a fase 3                               | 30 cenários; gate de voz sem avatar; escolha justificada de TTS/LLM; decisão registrada sobre fine-tuning, sem dependência de pesos ajustados nem treinamento com todo o histórico pessoal |
| 3. Memória e recuperação              | Histórico separado de resumos e memórias recuperáveis; extração controlada, confirmação, origem, correção, permissão de envio, exportação/exclusão de fatos e derivados, busca seletiva, jobs duráveis e retomada. Detalhar a proteção e retenção antes de habilitar dados pessoais | Reinício recupera trabalhos; busca usa apenas contexto pertinente; revisão/correção/exclusão e reconstrução efetivas; nenhum conteúdo inelegível enviado a provedor                        |
| 4. Texto e imagens                    | Upload, EXIF, mensagens durante chamadas, validação multimodal                                                                                                                                                                                                                      | Imagem e texto recebem resposta coerente e entram no histórico                                                                                                                             |
| 5. Live2D e interface completa        | Arte/rig, atuação sincronizada, legendas, histórico, fatos e configurações                                                                                                                                                                                                          | Avatar Live2D final funciona com voz, emoção e interrupção                                                                                                                                 |
| 6. Desktop                            | Tauri, instalador Windows, configuração e instruções dos serviços                                                                                                                                                                                                                   | Aplicativo instalado usa microfone, voz personalizada, Live2D e memória                                                                                                                    |
| 7. Integração e entrega               | Docker, contratos REST/WS, testes de falhas, backup/restauração, ensaio completo                                                                                                                                                                                                    | Relatório de aceite, documentação e pacote desktop entregues                                                                                                                               |

Live2D pode ser preparado em paralelo às avaliações de áudio; o projeto não termina na fase 1 ou 2. É necessário concluir as fases 5 e 6 para atender ao escopo aprovado.

Em 05/10/2026, o usuário autorizou a transição provisória para a fase 3 após os ajustes leves da persona 0.4.12. As notas de texto abaixo da meta e o reteste de continuidade permanecem pendentes; a transição não é aprovação desses gates. Os experimentos avançados ficam para depois da fase 3, conforme [a decisão](../decisions/Decisao_Persona_Fase_3.md).

A rotina proativa de NPC descrita na seção 7.2 permanece uma extensão proposta, sem requisito ou aceite ativo. Ela só deve ser adicionada ao escopo após sua especificação e aprovação; pode usar a infraestrutura de jobs da fase 3, mas não deve ser presumida como consequência automática da memória.

### 11.1 Requisitos implementados em cada fase

Os IDs abaixo correspondem à lista de requisitos aprovada em Requisitos_API_Amadeus_v2.pdf. Cada um dos **67 requisitos ativos** tem uma fase responsável por sua implementação principal. Requisitos que atravessam várias funcionalidades são ampliados e revalidados nas fases seguintes, conforme a seção 11.2; sua presença na tabela não significa que todos os testes de integração possam ser concluídos antecipadamente.

| Fase                                      | Requisitos funcionais                                                                                                                                                                                                                                                                                                                                                         | Requisitos não funcionais                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Fundação**                           | RF-001, RF-002: autenticação e rejeição de acesso inválido. RF-030: configuração dos adaptadores. RF-031: contratos REST e voz. RF-032: saúde. RF-043: consulta de capacidades e consumo.                                                                                                                                                                                     | RNF-001: isolamento dos dados. RNF-002: segredos. RNF-005: validação. RNF-010: transporte seguro. RNF-011: versionamento. RNF-015: estrutura e primeiros testes automatizados. RNF-021: política de dados. RNF-024: declaração de capacidades reais. |
| **1. Voz personalizada de ponta a ponta** | RF-004, RF-005: início e encerramento da chamada. RF-006, RF-007, RF-008, RF-009: envio, detecção e transcrição da fala. RF-010, RF-011, RF-012, RF-013, RF-014: geração, síntese, reprodução, interrupção e estados. RF-024: persistência durante a chamada. RF-029: configuração da voz. RF-033: logs e métricas. RF-039: reprodução parcial. RF-041: cotas e alternativas. | RNF-003, RNF-004: latência e interrupção. RNF-008: limites de consumo. RNF-012: continuidade diante de falhas. RNF-019: uso de memória e processamento. RNF-020: prevenção de efeitos duplicados.                                                    |
| **2. Persona e atuação**                  | RF-018, RF-019: aplicação e configuração da persona. RF-020, RF-021: emoção por segmento e sincronização dos eventos. RF-034: versões dos perfis vocais. RF-035: atuação vocal. RF-044: avaliação dos modelos e da voz.                                                                                                                                                       | RNF-017: identidade da voz personalizada. RNF-018: naturalidade e adequação emocional.                                                                                                                                                               |
| **3. Memória e recuperação**              | RF-022, RF-023: gerenciamento e histórico das conversas. RF-025, RF-026, RF-027, RF-028: resumos, extração, recuperação, correção e exclusão de fatos. RF-040: recuperação das tarefas de memória. RF-042: controle dos dados enviados à nuvem. RF-045: retomada da chamada.                                                                                                  | RNF-009: persistência, backup e restauração completos. RNF-013: reconexão sem duplicação.                                                                                                                                                            |
| **4. Texto e imagens**                    | RF-015: texto dentro e fora da chamada. RF-016, RF-017: envio e interpretação de imagens.                                                                                                                                                                                                                                                                                     | RNF-006: limites das imagens. RNF-007: remoção de metadados.                                                                                                                                                                                         |
| **5. Live2D e interface completa**        | RF-036: avatar Live2D. RF-037: sincronização da boca. Integração na interface final dos recursos já implementados de legendas, expressão, histórico, fatos e configurações.                                                                                                                                                                                                   | RNF-022: fluidez e sincronização do Live2D.                                                                                                                                                                                                          |
| **6. Desktop**                            | RF-038: aplicativo Windows empacotado com Tauri e instruções dos serviços.                                                                                                                                                                                                                                                                                                    | RNF-023: funcionamento após instalação, incluindo dispositivos, chamada e Live2D.                                                                                                                                                                    |
| **7. Integração e entrega**               | Validação integrada de todos os RF ativos das fases anteriores; consolidação da documentação RF-031 e do relatório de operação RF-033.                                                                                                                                                                                                                                        | RNF-014: execução documentada do backend em contêiner. Validação final de todos os RNF ativos, com testes completos, recuperação, restauração e desempenho.                                                                                          |

### 11.2 Complementos e validações entre fases

- **Segurança, contratos e testes:** RF-001, RF-002, RF-030, RF-031, RF-043 e RNF-001, RNF-002, RNF-005, RNF-010, RNF-011, RNF-015, RNF-021 e RNF-024 começam na fase 0. Cada nova rota, adaptador, modalidade e cliente deve estender essas proteções, contratos e testes na fase em que for acrescentado. Capacidades e consumo inicialmente podem ter dados mínimos, ampliados com a integração real dos provedores.
- **Encerramento e memória:** na fase 1, RF-005 e RF-024 salvam a chamada e deixam registrado o trabalho de memória pendente. A fase 3 implementa seu processamento e recuperação completos com RF-025 e RF-040; o aceite integral do encerramento com memória ocorre nessa fase.
- **Contexto da resposta:** RF-010 usa contexto recente e uma persona inicial na fase 1. A fase 2 valida a personalidade; a fase 3 incorpora a memória persistente permitida de RF-027.
- **Memória versus aprendizado:** RF-025 a RF-028 implementam histórico, resumos, fatos e recuperação explícita; isso não altera pesos do LLM. Os experimentos de fine-tuning posteriores à fase 3 são avaliados separadamente com dados curados e autorizados. A recuperação de memória continua sendo a fonte operacional de fatos pessoais editáveis e removíveis.
- **Autonomia proativa:** jobs e recuperação de tarefas de memória (RF-040) não implicam que a Amadeus possa iniciar conversas ou executar ações por conta própria. Rotina de NPC é extensão não aprovada, condicionada à especificação de agenda, consentimento, controles, notificações, limites e critérios de segurança.
- **Privacidade desde a primeira chamada:** a política de RNF-021 já deve impedir envio incompatível na fase 0. A fase 1 usa dados fictícios na avaliação dos provedores. A fase 3 completa RF-042 para histórico, resumos e fatos; a fase 4 estende o controle a imagens e aos fluxos completos de texto. Não esperar pela fase 3 para proteger o conteúdo enviado.
- **Texto como recuperação:** RNF-012 exige uma entrada mínima de texto e exibição da resposta já na fase 1 para tratar falhas de STT/TTS. RF-015 é concluído na fase 4, com os fluxos completos dentro e fora da chamada.
- **Cotas, métricas e duplicação:** RF-033, RF-041 e RNF-008, RNF-019, RNF-020 são ampliados na fase 3 para jobs e retomada, na fase 4 para imagens, e nas fases 5 e 6 para os clientes completos.
- **Expressão e avatar:** a fase 2 entrega os metadados sincronizados de RF-021 e os presets de voz. A fase 5 completa sua apresentação no Live2D, junto de RF-036 e RF-037. O teste vocal sem avatar permanece obrigatório na fase 2.
- **Qualidade e latência:** RF-044 e RNF-017, RNF-018 são avaliados na fase 2; os cenários visuais são completados na fase 4. RNF-003 e RNF-004 têm medições iniciais na fase 1 e validação com Live2D ativo na fase 5. A fase 6 repete os ensaios no desktop instalado; a fase 7 consolida os resultados finais, incluindo RNF-019 e RNF-022.
- **Entrega completa:** a fase 7 verifica os 67 requisitos ativos. Uma fase intermediária pode terminar com complementos explicitamente previstos acima; a entrega final só é aceita após sua conclusão e a validação dos critérios aplicáveis.

### 11.3 Requisitos adiados

**RF-003** (administração completa de múltiplos clientes) e **RNF-016** (garantia de 95% de disponibilidade mensal) não entram em nenhuma fase de implementação desta versão. Continuam identificados na lista para rastreabilidade. Embeddings e banco vetorial também permanecem adiados, sem ID próprio na lista atual; a memória da fase 3 usa busca textual. Fine-tuning de LLM não é requisito comprometido: a fase 2 pode executar uma prova de conceito, e qualquer uso operacional de pesos ajustados fica condicionado aos gates de qualidade e à capacidade de treinamento/hospedagem.

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

Atualização 2.4: posiciona fine-tuning do LLM como experimento opcional da fase 2, condicionado a dados autorizados, modelo/plataforma treináveis e avaliação comparativa. Separa esse experimento da memória da fase 3 e da adaptação vocal do TTS; pesos ajustados não são dependência de produção nem bloqueiam o escopo.

Atualização 2.5: explicita a arquitetura de assistente pessoal: memória consultável e controlável não é treinamento do LLM; limita o contexto recuperado ao pertinente, exige controle de envio a provedores e mantém fine-tuning como experimento opcional com conjunto curado. Registra rotina proativa de NPC como extensão a especificar e aprovar, sem alterar os 67 requisitos ativos.

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

## Registro da implementação da fase 1

Foram implementados o pipeline de chamadas, STT/TTS locais, adaptador Gemini, perfil de voz com SHA-256, entrada de texto, interrupção, confirmação de reprodução, histórico e métricas. Há um cliente técnico de áudio sem interface visual. O Gemini entrega texto por SSE a uma fila limitada de frases, permitindo iniciar TTS antes do fim da geração. STT trabalha por fala e TTS por segmento; o adaptador genérico HTTP mantém a alternativa com geração completa.

Em 04/10/2026, o usuário confirmou que a interrupção funciona e que a latência atual é aceitável para seu uso, autorizando o avanço para a fase 2 (persona e atuação). A fase 1 tem aceite funcional provisório; refinamentos de voz e desempenho continuam nas fases seguintes.

A validação formal das metas no hardware permanece pendente. Os motores locais e os provedores já foram executados em ensaios reais, e há uma referência vocal provisória selecionada. Ainda é necessário registrar 100 turnos e 30 interrupções automáticas durante áudio efetivamente reproduzido, com falhas, latência, ruído e RAM/VRAM. As metas de 2 s para resposta e 500 ms para interrupção não foram alteradas nem comprovadas pelos testes automatizados, que também não atestam naturalidade ou AEC.

As dubladoras citadas pelo usuário são referências artísticas para uma voz própria. Os nove MP3 locais fornecidos foram analisados por medidas acústicas preliminares, com limitações de música, múltiplos falantes e atuação. Não houve avaliação auditiva de timbre nem uso dessas gravações para clonagem. A proposta inicial está em `code/backend/assets/voice-profiles/design.json`.

Não foram adiados novos itens de escopo. Personalidade/expressão aprofundadas permanecem na fase 2; processamento de memória/retomada na fase 3; interface, Live2D e desktop nas fases já previstas. Consulte [protocolo da fase 1](../websocket/phase-1.md).

## Registro de implementação inicial da fase 2 — 04/10/2026

### Atualização de 05/10/2026

O usuário declarou a avaliação vocal concluída e aprovou a voz atual para avançar. Esse aceite substitui a pendência vocal de transição descrita nos registros antigos, sem inventar notas ou alegar execução do benchmark completo. Controles emocionais nativos adicionais não receberam validação específica.

RF-019 agora tem configuração persistida e validada via `GET/PUT /v1/persona`, com revisão concorrente e aplicação no próximo turno sem reinício. RF-034 recebeu versões vocais que reúnem referência/clone, modelo, configuração TTS, formato de síntese e presets; há listagem e restauração do TTS preservando LLM/STT. Configurações internas e pesos de serviços externos não são reinstalados por esse recurso.

A versão 0.4.10 mantém a estrutura e os complementos, usando direção concisa da skill e histórico limitado para reduzir o contexto. O Groq voltou a responder após a redução, mas posteriormente atingiu cota diária. O streaming Cloudflare recebeu correção para fragmentos numéricos enviados como números JSON, antes interpretados como indisponibilidade temporária.

Foi concluído um conjunto de 30 cenários no Cloudflare com a versão 0.4.9. A revisão por Codex encontrou problemas de naturalidade e resposta ao pedido atual, incluindo elogios, reparo de erro e limites de memória/lembrete. A 0.4.10 reforça esses pontos, com reteste completo ainda bloqueado por cotas de Groq/Cloudflare e indisponibilidade do Gemini. Os resultados de versões/hashes diferentes permanecem separados. Não há aprovação textual automática nem encerramento formal da fase 2; sua implementação avançou, mas o gate de texto e a confirmação de funcionamento prolongado continuam pendentes. Memória da fase 3 pode ser preparada em paralelo, sem declarar esses gates atendidos.

A análise `Persona_Kurisu_Amadeus_v0.4.md` foi preservada em `code/backend/assets/persona/source-v0.4.md`. O usuário aprovou o recorte anterior à viagem de Kurisu ao Japão. Persona `kurisu-amadeus-0.4.2`: prompt compacto versionado, distinção de biografia ficcional e vivências reais, humor contextual, cuidado, honestidade e limites de memória/capacidades.

Cada segmento tem direção artística validada ligada a `responseId` e `segmentId`, emitida por `reply.expression`. O estado expressivo é limitado, suavizado e isolado por chamada. A mesma geração LLM produz expressão e texto; não há uma segunda geração para atuar. Os metadados são removidos antes do TTS. Presets e expressões visuais são semânticos: controles emocionais nativos do TTS permanecem não validados, e Live2D continua na fase 5. A referência e a configuração vocal aceitas são preservadas.

O conjunto de 30 cenários e a rubrica existem, com coleta contabilizada e revisão humana. O ensaio real encontrou uma resposta inventando atividade no laboratório; o prompt foi reforçado, sem confirmação posterior de resolução por falta de ensaio completo. Cota local e indisponibilidade impediram o lote completo. Foram gerados três WAVs de continuidade, sem saturação digital detectada; a escuta ainda precisa avaliar qualidade e identidade.

O aceite da fase 2 exige completar os cenários por modelo, revisão de persona/naturalidade e teste vocal sem avatar conforme a seção 10. Não foi declarado concluído. Decisão atual: manter os modelos/voz configurados e usar prompt; não executar fine-tuning sem dados curados e evidência de ganho. Consulte `code/backend/evals/persona/README.md` para comandos, limitações e resultados parciais. Memória persistente, NPC proativo e pesos ajustados não foram implementados nesta etapa.

### Decisão posterior de transição — 05/10/2026

A versão 0.4.11 completou os 30 cenários no Qwen gratuito via OpenRouter; revisão por Codex encontrou médias de 3,13/5 em fidelidade e naturalidade, 11 respostas boas e 19 para ajustar. O diálogo encadeado completou oito de doze turnos, com o restante bloqueado por cota. A 0.4.12 aplica ajustes leves de direção e exemplos em Markdown, mantendo a estrutura e o contrato expressivo. Seu reteste em 05/10/2026 concluiu nove respostas no Groq antes de cota e tentou os 30 cenários no Cloudflare, com 28 respostas completas. Revisão por Codex nas 28: fidelidade 3,25/5, naturalidade 3,50/5, 15 boas e 13 para revisar. P29 falhou duas vezes com rubrica/JSON bruto bloqueados pelo backend; P30 ficou sem resposta por cota/indisponibilidade. A continuidade nova foi bloqueada em D01. Modelos e coberturas diferentes impedem atribuir ganho apenas ao prompt; avaliação humana e gate textual permanecem pendentes. Relatórios locais em `code/backend/api/data/persona-evals/review-0.4.12.md` e `review-0.4.12-groq.md`; sem alteração de cotas ou configuração ativa.

O usuário autoriza avançar para a fase 3 após esses ajustes, com aceite provisório da transição e pendências de qualidade explícitas. Fine-tuning local, módulos locais, estado emocional inspirado em neurochemistry e memória associativa inspirada em Hebb serão retomados após concluir a fase 3, com zero gasto adicional em APIs/treinamento/GPU na nuvem. Esta decisão posterior define a sequência atual e não transforma os ensaios incompletos anteriores em aprovação. Consulte [Decisao_Persona_Fase_3.md](../decisions/Decisao_Persona_Fase_3.md).

O refinamento posterior `kurisu-amadeus-0.4.13`, autorizado em 05/10/2026, mantém ajustes no Markdown principal, trocando frases prontas por gatilhos de reação e esclarecendo reparo científico, identidade ficcional, histórico da sessão e formato. O prompt tem 19.146 caracteres dentro do teto existente de 20.000. Uma rodada curta separada (`refinement-v1.json`, oito regressões e quatro situações novas) verifica os pontos antes do próximo ensaio completo. Formatter, lint, typecheck, 252 testes e build passaram; os resultados de inferência e falhas por modelo ficam localmente em `code/backend/api/data/persona-evals/review-0.4.13.md`. A implementação não certifica melhora estável; a transição continua provisória e o gate textual pendente.

Em 05/10/2026, o usuário autorizou os commits separados em pt-BR, sem descrição, preservando essa base para implementar a fase 3. A implementação da fase 2 está entregue para a transição, com validação de qualidade/continuidade textual ainda pendente e voz aceita. Os ensaios físicos da fase 1 continuam registrados; não há declaração de limite técnico atingido pelo prompt engineering. O próximo escopo é memória e recuperação, e os experimentos avançados permanecem posteriores à fase 3, conforme [o marco de código](../decisions/Decisao_Persona_Fase_3.md).

## Registro da implementação da fase 3 — 05/10/2026

O usuário aprovou memória híbrida com histórico, resumos extrativos, fatos confirmáveis e grafo leve de entidades/relações no próprio SQLite. A API implementa gestão e exportação de memória, recuperação lexical com até duas relações, orçamento de contexto, permissões por fato/resumo, tarefas persistentes e retomada de chamada com ticket novo. Correção, exclusão, reconstrução e reinício mantêm bloqueios de fontes e não promovem sugestões automaticamente. LangGraph, embeddings, treinamento e NPC proativo não são dependências desta entrega.

O padrão usa extração local, memória sintética e nenhuma exclusão automática por retenção. Uso pessoal requer configurar retenção e reconhecer armazenamento local sem criptografia própria; envio remoto requer também permissão e política aprovada. Extração LLM é optativa, contabilizada nas cotas existentes e adiada para preservar capacidade de conversa. O backup da memória é um snapshot SQLite consistente; referências de voz, modelos e ambiente precisam ser preservados separadamente.

O ensaio local com 1.002 fatos fictícios recuperou 424 caracteres, com trinta medições após aquecimento: p50 de 2,32 ms e p95 de 3,72 ms, sem inferência. São medidas de busca local, não da chamada completa nem prova de qualidade semântica abrangente. O relatório bruto fica em `code/backend/api/data/memory-evals/`, ignorado pelo Git. A validação automatizada inclui gestão, fontes, políticas, cotas, exclusão/reconstrução, restauração e contexto na chamada WebSocket. O aceite de uso pessoal/inferência real e as pendências de qualidade e desempenho das fases anteriores continuam explicitamente separados.

Consulte [Memoria_Fase_3.md](../architecture/Memoria_Fase_3.md) para arquitetura, comandos, limites e semântica de exclusão/retomada. Esta implementação não antecipa a interface completa da fase 5 nem declara concluídos os benchmarks físicos ou o gate textual da fase 2.

**Fechamento funcional em 05/10/2026:** o usuário validou a recuperação de uma preferência em outra conversa. Foram acrescentadas normalização de sujeitos, deduplicação conservadora com preservação de evidências, consolidação de dados legados e revisão pela CLI com comandos de IDs reais. Quinze verificações integradas em dados sintéticos passaram com extração e respostas de modelos reais, incluindo correção, expiração, esquecimento, reconstrução e reinício; falhas intermediárias de execução/cota foram preservadas nos relatórios. Verificação de código: 320 testes da API, 47 dos clientes, formatação, lint, tipos e build. O escopo funcional da fase 3 está concluído; o extrator provisório permanece Groq até validar o acesso à Z.ai. Refinamento avançado da persona, interface completa e pendências anteriores mantêm seus escopos próprios. O detalhe do aceite e das limitações está na arquitetura.
