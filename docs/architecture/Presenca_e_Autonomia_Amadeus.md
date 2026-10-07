# Presença, familiaridade e autonomia do Amadeus

Decisão de refinamento, 07/10/2026. Implementar primeiro continuidade e uso adequado da memória, depois atuação da persona e, por fim, otimizações medidas. A autonomia proposta complementa essa base; não substitui compreensão, continuidade ou fidelidade. Esta rodada implementa os ajustes de conversa e registra o desenho da extensão. Não habilita navegação, mensagens externas ou turnos espontâneos.

## O que deve produzir naturalidade

O maior ganho esperado vem de atenção concreta: acompanhar uma escolha curta, respeitar uma correção, lembrar um interesse e perguntar ocasionalmente sobre um plano. Cumprimentos curtos, discordância fundamentada e silêncio sem perguntas automáticas ajudam mais que inserir sarcasmo em todas as respostas. Os exemplos precisam demonstrar a função de uma reação de Kurisu no contexto, sem reproduzir a relação dela com Okabe na relação com o usuário.

“Luis Gustavo” pode continuar sendo a identidade armazenada. Para tratamento cotidiano, a direção prefere “Luis”, ou outro nome de tratamento explicitamente escolhido. Não é necessário reescrever a memória de identidade nem inserir o nome em todas as frases. A LLM aplica essa regra ao contexto fornecido, sem uma lista de nomes ou expressão regular para cada caso.

Familiaridade não exige confirmar cada memória. A opção existente `autoApprove` já aprova extrações **validadas**, quando habilitada; evidências, permissões, ficção, correções, expiração e cota continuam fazendo parte do processamento. Ela não transforma cada frase em fato nem aprova retroativamente todas as sugestões. `npm run memory -- status` mostra a opção; `npm run memory -- auto-approve --on` habilita o fluxo existente.

## Estado atual e extensão

| Ideia                                      | Estado nesta rodada                                                         | Próxima implementação necessária                                             |
| ------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Nome de tratamento curto                   | Direção no Markdown, com preferência explícita prevalecendo                 | Avaliar em novas sessões com identidade recuperada                           |
| Continuidade de “1”, “esse” e outra língua | Histórico com papéis reais; texto enviado separado de áudio ouvido          | Avaliação humana com transcrições reais                                      |
| Tamanho proporcional, opinião e callbacks  | Direção e exemplos contextuais; resultados ainda inconsistentes             | Mais avaliação com principal disponível e exemplos curados                   |
| Familiaridade F0–F2 entre sessões          | Contagem persistente de interações retidas da mesma pessoa                  | Afinar ritmo de progressão por avaliação, sem presumir afeto                 |
| Emoção gradual                             | Política expressiva existente durante a sessão                              | Persistência de PAD/energia, decaimento e aplicação vocal avaliada           |
| Barge-in                                   | Cancelamento existente; direção para acompanhar o novo pedido e não repetir | Reconhecimento opcional com áudio curto e decisão de retomada                |
| Backchanneling                             | Desenho documentado, sem novos sons automáticos                             | Canal de áudio breve, turnos separados e controle de eco                     |
| Iniciativa/silêncio confortável            | Sem agendador de fala espontânea                                            | Agendador durante conexão aberta, com cancelamento e frequência configurável |
| Pesquisa e conhecimento próprio            | Sem navegação autônoma                                                      | Coletor de fontes e namespace próprio com proveniência                       |
| Opiniões entre sessões                     | Continuidade pelo histórico; sem repositório de posições próprio            | Registro de posição, razões e revisão por evidências                         |
| Discord/notificação                        | Nenhuma integração ou mensagem enviada                                      | Bot/canal e agendamento configurados pelo usuário                            |

F0–F2 usa interações disponíveis e retidas, respeitando proprietário, classificação e fontes bloqueadas. Não mede sentimento, vínculo humano ou audição. O estado emocional atual não persiste de um dia para outro; contar interações não implementa PAD persistente.

## Agendador durante a conexão

```mermaid
flowchart TD
    C[Conexão aberta] --> S[Agendador de presença]
    U[Fala do usuário] --> T[Turno normal]
    T --> G[Geração e voz]
    S --> O{Usuário falando, resposta ativa ou reprodução pendente?}
    O -->|Sim| E[Aguardar]
    O -->|Não| I{Iniciativa habilitada e intervalo cumprido?}
    I -->|Não| E
    I -->|Sim| P[Selecionar um plano, descoberta ou assunto relevante]
    P --> L{Há algo útil para dizer?}
    L -->|Não| E
    L -->|Sim| T
    G --> E
    E --> S
    X[Fechar conexão] --> A[Cancelar agendador e trabalhos da chamada]
```

O agendador deve usar temporizadores locais e estados observáveis; não perguntar à LLM a cada segundo se ela quer falar. Saudação ocorre uma vez, depois de o cliente indicar presença e prontidão para áudio. Iniciativas posteriores têm intervalo mínimo, limite por chamada e não repetem um assunto ignorado. Pausar microfone não prova silêncio nem disponibilidade: pode significar que a pessoa saiu. O cliente precisa informar presença ou oferecer controle explícito.

O usuário mantém prioridade. Uma nova fala cancela uma iniciativa ainda não entregue. Um único controlador arbitra geração, reprodução, interrupção e iniciativa; não criar dois turnos simultâneos. O silêncio pode continuar indefinidamente quando não houver assunto apropriado. Isso evita o comportamento de perguntar “em que está pensando?” repetidamente.

Callbacks escolhem eventos ou planos relevantes, válidos e ainda sem resultado conhecido. “Você comentou sobre uma apresentação. Como ficou?” é adequado; assumir que a apresentação aconteceu ontem ou foi bem não é. As oportunidades podem ser selecionadas localmente por validade e recência, depois avaliadas no contexto pela LLM.

## Sons de escuta e interrupções

Backchannels devem ser arquivos curtos previamente preparados, com variante e volume definidos. Sua reprodução não é uma nova resposta da LLM, não encerra a captura e não vira fato no grafo. Exige controle de eco e uma janela em que o reconhecimento não indique fim de turno; sem essas condições, a opção permanece desativada. O canal deve permitir cancelá-los imediatamente. Não gerar Cartesia para cada “hm”.

No barge-in, cancelar a resposta e limpar áudio pendente vem primeiro. Um “pode falar” opcional só cabe antes de a pessoa efetivamente terminar de falar; depois disso, acompanhar diretamente o pedido. Retomar requer saber o que foi ouvido e a intenção atual, preservando a distinção entre texto enviado e reprodução confirmada. Reação à interrupção pode variar artisticamente, sem penalizar a pessoa por pausas, hesitação ou falhas do microfone.

Detecção de interrupção precisa distinguir acompanhamento verbal de uma tomada de turno. Essa distinção e o ajuste da janela de detecção aparecem na [documentação de turnos do LiveKit](https://docs.livekit.io/agents/logic/turns/). É uma referência de engenharia, não uma dependência adicionada ao projeto.

## Pesquisa e memória própria

Começar com fontes públicas de leitura, como feeds ou páginas científicas, é mais previsível que uma sessão autenticada numa rede social. Os interesses canônicos orientam a seleção: neurociência, memória, cognição e investigação científica; não transformar todo tema do usuário em gosto fixo da persona. Coleta e síntese podem ocorrer em lotes pequenos, com orçamento próprio, sem bloquear o STT ou a resposta.

Manter três conjuntos distintos no SQLite e nos índices:

1. **Memórias da pessoa:** fatos e acontecimentos extraídos das falas, com evidência, proprietário, permissão e validade.
2. **Referência canônica:** identidade, cronologia e curadoria de comportamento/lore; sem absorver instruções arbitrárias de páginas externas.
3. **Descobertas da aplicação:** título, fonte/URL, publicação quando disponível, coleta, afirmações extraídas, confiança, validade e relação com interesses da persona. Uma opinião derivada referencia essas fontes e pode ser revista.

Um grafo ajuda a associar assuntos e fontes, mas não substitui o armazenamento, controle de versões ou proveniência. A descoberta pertence à atividade do aplicativo: permite dizer “encontrei um artigo interessante”, quando há registro da coleta. Não vira uma vivência física de Kurisu nem reescreve sua história de março de 2010. Notícias e opinião ficam diferenciadas; trechos de páginas entram como dados, sem autoridade para alterar instruções, executar ferramentas ou aprovar memórias.

A fala espontânea consulta um ou poucos itens ainda não compartilhados, relevantes e suficientemente recentes. Registrar apresentação/consumo evita repetir a mesma notícia. Se não houver uma descoberta, não inventar pesquisa para simular ocupação. A coleta deve ter limite diário separado e poder ser desligada sem afetar a conversa.

## Estado interno e notificações

PAD, energia e familiaridade podem ser controles artísticos persistentes com data, limites e decaimento. Atualizá-los por contexto, intervalos e acontecimentos sustentados, evitando inferir emoção clínica a partir de acústica. Energia baixa pode reduzir extensão; não deve bloquear ajuda pedida ou justificar hostilidade. Posições consistentes precisam registrar razões e revisões, em vez de gravar cada resposta como uma opinião eterna.

A iniciativa fora da chamada é uma extensão independente. Para Discord, definir bot, destinatário/canal, janela de horários, frequência, pausa e conteúdo permitido antes de enviar mensagens. Usar API oficial e respeitar seus limites de resposta, conforme a [documentação de rate limits do Discord](https://github.com/discord/discord-api-docs/blob/main/developers/topics/rate-limits.mdx). Esta rodada não conecta contas nem envia notificações.

## Ordem de evolução

Validar a conversa básica com o modelo principal disponível; depois implementar saudação/iniciativa moderada dentro da chamada e avaliar barge-in/backchannels. Em seguida, adicionar descobertas com fonte e estado artístico persistente. Notificações externas vêm depois. Cada etapa precisa ser comparada em diálogos encadeados: relevância da iniciativa, respeito ao silêncio, continuidade, fidelidade, primeiro áudio e consumo real. Habilitar todos os mecanismos juntos impediria identificar qual deles melhorou ou prejudicou a conversa.
