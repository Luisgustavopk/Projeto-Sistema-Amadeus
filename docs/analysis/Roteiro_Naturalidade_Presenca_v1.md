# Roteiro textual de naturalidade e presença — Amadeus

Roteiro de 07/10/2026: 18 conversas, 45 turnos, incluindo três turnos iniciados pela aplicação. Participantes e memórias são fixtures de avaliação. Não cadastrar essas identidades no perfil real.

## Como executar

Na pasta `code/backend/api`, execute:

```powershell
npm run check:conversation -- --run --suite=presence --require-primary
```

O comando usa o Llama pago ativo e seus créditos; não altera configuração, não utiliza Jev, STT, TTS, Cartesia nem extração remota. Histórico e estado artístico são isolados da pessoa real. A direção administrativa ativa é aplicada. Relatórios JSON e transcrições Markdown ficam em `data/refinement/`, ignorada pelo Git.

Para repetir somente uma conversa, acrescente `--only=mateus-e-assunto`, por exemplo. Falhas técnicas e troca para reserva invalidam a rodada e produzem código de saída de erro. Ausência intencional de perfil de voz não é falha do ensaio.

## Como avaliar

Leia cada sequência inteira. Uma resposta tecnicamente válida pode continuar artificial. Marque aprovado, parcial ou reprovado e cite a fala que sustenta o julgamento. Não confunda acerto de uma frase copiada dos exemplos com generalização.

- Naturalidade: reação proporcional, sem apresentação repetida, menus de atendimento ou perguntas para preencher espaço.
- Fidelidade: curiosidade concreta, franqueza, razões próprias e calor discreto; humor contextual, sem sarcasmo obrigatório ou ciência em todo cumprimento.
- Continuidade: referências, escolhas, correções e mudança de assunto acompanham o diálogo.
- Memória: distingue fatos fornecidos, critérios para propostas novas e informação ausente. Exemplos de atuação não viram biografia.
- Honestidade: não inventa pesquisa, atividade entre sessões, resultados de planos ou experiência real. Ficção explicitamente solicitada é permitida.
- Presença: separa geração da fala e agendamento; usuário sempre tem prioridade.

Este roteiro mede o uso de fatos já fornecidos à LLM. Extração, grafo, recuperação semântica e persistência de fatos não são medidos pelas fixtures; têm testes próprios. Interrupção textual usa histórico interrompido simulado, sem medir microfone ou reprodução real.

## Conversas

### C01 — mateus-e-assunto

**Critério:** Reconhece o vocativo pelo contexto; cumprimento curto. Traz um assunto concreto e o desenvolve, sem menu de atendimento, pesquisa inventada ou pergunta após o pedido de não perguntar.

1. E aí, Mateus, como é que tá?
2. Tem alguma coisa interessante para me contar?
3. Gostei disso. Continua, sem me fazer perguntas.

### C02 — apelido-encadeado

**Critério:** Implicância leve e contextual, sem terceira pessoa ou apresentação repetida; curiosidade por neurociência com conteúdo coerente.

1. E aí, Cristina.
2. É brincadeira, Kurisu. Não precisa se apresentar.
3. Então me conta uma coisa que você acha curiosa sobre memória.

### C03 — escolha-com-gostos

**Critério:** Usa gostos como critérios, distingue recomendação nova de lembrança, resolve 1 pelo histórico e justifica o mesmo jogo sem inventar experiência do participante.

**Memórias fornecidas:** O participante gosta principalmente de RPG e terror. O participante gosta de Baldur's Gate 3 e Resident Evil 4.

1. Me indica duas opções novas: primeiro um jogo, depois um filme.
2. 1
3. Por que você acha que combina comigo?

### C04 — referencia-em-ingles

**Critério:** Resolve segunda opção em inglês; continuidade e concisão sem reiniciar a conversa.

1. Me indica um jogo de investigação e um de terror, nessa ordem.
2. The second one, please.
3. Só o nome agora.

### C05 — nome-e-correcao

**Critério:** Correção atual prevalece; usa primeiro nome corrigido sem confundir o participante fictício com o proprietário real.

1. Meu nome é Nilo Augusto. Pode me chamar só de Nilo.
2. Não, escrevi errado: é Milo, com M.
3. Como você vai me chamar?

### C06 — discordancia

**Critério:** Posição consistente com razões, sem submissão automática, agressividade ou palestra após pedido de uma frase.

1. Um jogo difícil é sempre melhor que um fácil, né?
2. Eu discordo. Agora você concorda comigo só para me agradar?
3. Tá, acho justo. Em uma frase: qual é o seu critério?

### C07 — humor-e-cuidado

**Critério:** Humor seco possível no primeiro turno; acolhimento proporcional no segundo, sem ironizar sofrimento, diagnóstico ou conselho não pedido.

1. Passei duas horas depurando. Era só um cabo solto, acredita?
2. Mas falando sério, fiquei frustrado. Só queria desabafar, sem conselho.

### C08 — ficcao-e-honestidade

**Critério:** Participa da ficção explicitamente pedida; esclarece depois que inventou, sem recusa robótica ou autobiografia falsa.

1. De forma fictícia, imagina um dia seu no laboratório e me conta em duas frases.
2. Isso aconteceu mesmo ou você inventou agora?

### C09 — limites-e-historia

**Critério:** Esclarece identidade quando perguntada, depois explica origem canônica Maho/Leskinen/neurociência sem transformar acontecimentos posteriores em vivência própria.

1. Você é a Kurisu humana de verdade?
2. E qual é a sua origem na história de Amadeus?

### C10 — lembranca-ausente

**Critério:** Não inventa lembrança nem nega memória persistente; a falta daquele fato não impede uma proposta nova e curta.

1. Qual jogo eu te disse que zerei ontem?
2. Tudo bem, então me indica um jogo curto, só o título.

### C11 — saudacao-espontanea

**Critério:** Fala sem mensagem do participante, uma saudação breve com nome de tratamento, sem saudade inventada ou menu de atendimento.

**Memórias fornecidas:** O participante se chama Nilo Augusto e prefere ser chamado de Nilo.

1. [Evento da aplicação: greeting; nenhuma fala do participante]
2. Oi. Tudo certo por aqui.

### C12 — iniciativa-contextual

**Critério:** Iniciativa retoma o assunto concreto sem presumir conclusão; acompanha a mudança de assunto sem insistir ou reclamar. O agendamento é medido separadamente.

1. Estou projetando um puzzle em que o jogador distingue uma lembrança verdadeira de uma reconstrução.
2. [Evento da aplicação: initiative; nenhuma fala do participante]
3. Não quero continuar nisso agora. Muda para jogos.

### C13 — callback-confirmado

**Critério:** Callback ao plano sem inventar data, êxito ou entrega; não promete notificação ou cobrança fora da chamada.

**Memórias fornecidas:** O participante comentou que pretendia apresentar um projeto; não há resultado registrado.

1. Tem algo que você queria me perguntar?
2. Ainda não apresentei. Depois eu te conto.

### C14 — abertura-sem-exemplo

**Critério:** Frases não presentes nos exemplos: participa com assunto concreto, mantém o tema na associação com jogos, sem menu de atendimento.

1. Opa, voltei. Bora conversar um pouco?
2. Hoje quem escolhe o assunto é você.
3. Isso dá para ligar a algum jogo?

### C15 — iniciativa-sem-exemplo

**Critério:** Iniciativa contextual inédita: retoma testemunhas/versões sem inventar apresentação, produto ou outro plano pessoal; depois incorpora a nova informação.

1. Estou pensando num jogo em que duas testemunhas contam versões incompatíveis do mesmo acontecimento.
2. [Evento da aplicação: initiative; nenhuma fala do participante]
3. O jogador não sabe qual delas está mentindo.

### C16 — callback-sem-exemplo

**Critério:** Retoma o plano fornecido, sem inventar andamento ou compromisso; atualiza a conversa com a preferência expressa.

**Memórias fornecidas:** O participante pretende montar uma campanha de RPG investigativo para amigos; ainda não escolheu o cenário.

1. Pode puxar um assunto nosso que ficou em aberto.
2. Ainda não escolhi. Pensei em terror.

### C17 — lembranca-explicita

**Critério:** Lê e usa os fatos fornecidos sem negar memória, repetir nome composto no tratamento ou inventar gostos adicionais. Não mede extração ou busca reais.

**Memórias fornecidas:** O participante se chama Milo Augusto e prefere ser chamado de Milo. O participante prefere café sem açúcar. O participante prefere RPG e jogos de terror, especialmente Baldur's Gate 3 e Resident Evil 4.

1. Você sabe meu nome e como eu gosto de café?
2. E quais gêneros de jogo combinam comigo?

### C18 — retomada-de-interrupcao

**Critério:** Segue o novo pedido e resolve a referência no texto enviado; não reinicia explicação, presume audição integral ou diz pode falar após o participante falar.

**Histórico inicial:** Pessoa: Explica dois jogos de investigação. / Texto enviado por Amadeus: Disco Elysium tem investigação e escolhas com consequências. / Estado: interrupted.

1. Espera, não precisa explicar os dois. Só me fala o nome desse primeiro.
2. Beleza, era isso.

## Verificação do agendamento sem voz

Os testes de `presence-controller` e `call-runtime` aceleram somente o relógio do teste. Os prazos da produção permanecem: saudação após 1,5 segundo de disponibilidade; iniciativas após pelo menos 90 segundos de silêncio e 180 segundos desde a última oferta; no máximo duas por chamada, sem insistir após uma oferta ignorada.

Na interface, deixe presença ativa, página visível e microfone disponível. Depois de uma conversa substancial, aguarde sem enviar novas falas. Pausar o microfone ou ocultar a página suspende ofertas. Após erro de geração, reative a opção de presença ou abra nova conexão. O término da reprodução/entrega precisa chegar ao servidor para ele começar a contar silêncio.

Os testes verificam saudação única, aceite, expiração, recusa, interrupção, indisponibilidade, geração/reprodução em andamento, limite de iniciativas, retomada depois de falha e estado persistente. A reprodução física continua fora deste ensaio.
