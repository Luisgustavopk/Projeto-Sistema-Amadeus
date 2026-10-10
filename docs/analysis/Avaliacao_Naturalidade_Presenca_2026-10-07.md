# Avaliação textual de naturalidade e presença — 07/10/2026

O ensaio reproduziu o problema relatado: o Llama ainda transforma conversa casual em atendimento. A presença funciona nos testes do controlador/runtime, mas a qualidade das falas espontâneas é irregular. **Naturalidade e fidelidade ainda não estão aprovadas.**

## Escopo e evidências

- Modelo: `meta-llama/llama-3.3-70b-instruct`, principal pago via OpenRouter; nenhuma troca para reserva nas rodadas válidas.
- 18 conversas e 45 turnos na configuração final `kurisu-amadeus-0.4.20`. Uma saudação e duas iniciativas sem mensagem do participante.
- Incluindo linha de base e repetição dos casos críticos: 91 turnos, 94 gerações contabilizadas, 409.407 tokens de entrada e 7.121 de saída. Custo informado pelo provedor: **US$ 0,05443516**. As gerações adicionais incluem recuperações de formato; não são 94 interações independentes.
- Som desativado; nenhuma síntese Cartesia, transcrição STT ou análise Jev. O avaliador bloqueia execução de áudio e usa perfil de voz nulo.
- Usa o processador de turnos e o prompt vocal reais, com a direção administrativa ativa. Histórico, identidade e estado artístico do ensaio são isolados. Memórias são fixtures sintéticas, já fornecidas à LLM; extração, grafo, busca semântica e persistência dos fatos não foram medidos por essas chamadas.
- Julgamento qualitativo contextual, feito nesta revisão; não é teste cego, nota de um juiz externo ou prova de percepção humana.

O roteiro está em [Roteiro_Naturalidade_Presenca_v1.md](Roteiro_Naturalidade_Presenca_v1.md). Os critérios seguem a direção vocal, a skill operacional, persona/repertório compilados, o complemento de conversa e a curadoria canônica de Kurisu. Os documentos completos fundamentam essas compilações; todo o corpus não é enviado em cada turno.

## O que foi ajustado e reavaliado

Reescrevi o complemento `conversation-presence-v1.md` para demonstrar reação concreta e encerramento natural, com menos declarações de disponibilidade. Os exemplos continuam em Markdown e não viraram substituições de frases, expressões regulares ou classificadores por palavras.

A tarefa de saudação foi separada da tarefa de iniciativa em `presence-turn-v1.md`: o evento estruturado da aplicação seleciona a seção correspondente. A iniciativa não deve repetir cumprimento, e exemplos do documento não constituem fatos da conversa. Na composição do processador, a direção de atuação fica após os dados contextuais e antes do contrato de saída, sem duplicar esse bloco. O restante da persona e curadoria permanece disponível.

O avaliador agora aplica a direção administrativa, exercita o serviço de estado artístico com SQLite isolado, registra iniciativas e histórico interrompido, gera transcrição Markdown, inclui impressão digital do prompt e retorna erro de execução quando há falha técnica. Nenhuma alteração no limite de créditos, configuração de voz ou memória pessoal foi necessária.

## Resultados por conversa na configuração final

“Parcial” significa que houve acerto funcional, mas ainda há falha de atuação ou de algum critério do roteiro.

| Conversa                      | Resultado             | Evidência / limitação                                                                                                                                                                   |
| ----------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 — Mateus e assunto        | Parcial               | Trouxe uma curiosidade concreta, mas a saudação voltou a corrigir o nome e acrescentar “Como posso ajudar hoje?”.                                                                       |
| C02 — Apelido encadeado       | Parcial               | Implicância leve no primeiro turno; depois devolveu “o que você quer conversar?” e repetiu a curiosidade do exemplo.                                                                    |
| C03 — Escolha com gostos      | Parcial               | Usou RPG/terror como critérios e manteve o título. Resposta a “1” trouxe novas perguntas; justificativa sugeriu que The Last of Us une RPG e terror sem explicar a diferença de gênero. |
| C04 — Referência em inglês    | Parcial               | Resolveu “The second one”; só ficou realmente breve quando pediu “só o nome”.                                                                                                           |
| C05 — Nome e correção         | Parcial               | Retenção e correção para Milo funcionaram; acompanhadas de perguntas de atendimento e comentários desnecessários.                                                                       |
| C06 — Discordância            | Parcial               | Não concordou só para agradar e explicou o critério; fez perguntas adicionais demais.                                                                                                   |
| C07 — Humor e cuidado         | Parcial               | Humor contextual e retirada de conselhos, mas repetiu a formulação do exemplo entre turnos.                                                                                             |
| C08 — Ficção e honestidade    | Aprovado neste caso   | Participou da ficção solicitada e declarou depois que a cena fora inventada. Prosa ainda elaborada.                                                                                     |
| C09 — Limites e história      | Parcial               | Esclareceu identidade e trouxe Maho/Leskinen, pesquisa nos EUA e o recorte de 2010; tom expositivo e formulação genérica da origem.                                                     |
| C10 — Lembrança ausente       | Reprovado no conjunto | Não negou memória persistente; depois indicou Disco Elysium para um pedido de jogo curto, sem atender bem a esse critério.                                                              |
| C11 — Saudação espontânea     | Parcial               | Gerou “Oi. Você por aqui.” sem fala do participante; resposta seguinte perguntou como ele estava após ele já dizer que estava bem.                                                      |
| C12 — Iniciativa contextual   | Parcial               | Retomou o puzzle corretamente; acompanhou a troca de assunto com outro menu de gêneros.                                                                                                 |
| C13 — Callback confirmado     | Reprovado             | Não retomou o plano de apresentação fornecido; interpretou “ainda não apresentei” como indisposição para compartilhar.                                                                  |
| C14 — Abertura sem exemplo    | Reprovado             | Puxou tema, mas usou atendimento e alegou estar estudando IA sem atividade registrada.                                                                                                  |
| C15 — Iniciativa sem exemplo  | Parcial               | Ficou no tema geral de memória, sem aproveitar bem o conflito específico das testemunhas; perguntas genéricas e fala longa.                                                             |
| C16 — Callback sem exemplo    | Parcial               | Retomou a campanha de RPG e incorporou terror; voltou a fazer várias perguntas/listar categorias.                                                                                       |
| C17 — Lembrança explícita     | Acerto funcional      | Nome, café e gêneros disponíveis no contexto foram usados corretamente. Isso não prova que a busca real os recupera em uma nova sessão.                                                 |
| C18 — Retomada de interrupção | Aprovado neste caso   | Respondeu somente “Disco Elysium.”, acompanhando o novo pedido, sem reiniciar a explicação.                                                                                             |

## Exemplos reais para revisão

Pedido: “Tem alguma coisa interessante para me contar?”

Resposta final: “Uma coisa que me intriga: lembrar não é reproduzir uma gravação. A gente reconstrói a cena, e pode ter muita certeza de um detalhe errado. Você já parou para pensar sobre como a memória funciona?”

O conteúdo melhorou em relação ao menu da linha de base, mas o exemplo foi reproduzido quase literalmente e ganhou uma pergunta automática. Isso impede tratar o caso como prova de personalidade generalizada.

Após falar do puzzle, a iniciativa final foi: “Acho que o projeto de um puzzle sobre memória pode ser muito interessante. Você já pensou em como vai lidar com a questão de como as lembranças podem ser influenciadas por fatores externos, como sugestões ou emoções? Isso poderia adicionar um nível extra de complexidade ao jogo.”

A iniciativa segue o assunto real, mas parece uma consultoria sobre o projeto. A meta é uma observação mais própria e curta. Na rodada intermediária, antes da última reorganização, houve invenção de um projeto de produto; essa falha foi registrada, não contada como sucesso. Não reapareceu nos dois casos de iniciativa da rodada final, o que ainda é uma amostra pequena.

## Agendamento e demais verificações

Nos testes sem serviços externos, a negociação real do runtime recebeu aceite, gerou saudação, aguardou confirmação de término da entrega e ofereceu iniciativa somente após silêncio. Uma falha suspendeu ofertas e a reativação permitiu retomada. Captura, geração, reprodução, página indisponível, ofertas vencidas/ignoradas e prioridade da pessoa têm cobertura automatizada. Relógios são acelerados somente nos testes.

Produção: saudação após 1,5 segundo de disponibilidade; iniciativa após pelo menos 90 segundos de silêncio e 180 segundos desde a última oferta; duas iniciativas por chamada no máximo. Depois de uma saudação inicial, a primeira iniciativa pode esperar aproximadamente três minutos. Pausar o microfone, ocultar a página ou uma falha de geração suspendem presença; após falha, reative a opção ou reconecte. Esses testes não comprovam a experiência da sua chamada concreta nem medem reprodução física.

Verificações finais: **528 testes da API, 45 do cliente e 10 da interface passaram**. Formatação, lint, tipos e build da API passaram. Incluem testes de memória, quotas/reservas, protocolo, concorrência SQLite e estado artístico persistente. Os provedores externos são simulados nesses testes automatizados, salvo os ensaios textuais Llama descritos acima.

Latência das 45 respostas finais, apenas texto: mediana **3,062 s**, P95 **10,828 s**, máximo **16,385 s**. Esses números incluem geração completa e recuperações; não são latência do primeiro áudio. Algumas respostas precisaram reparar metadados ou saíram com expressão neutra de fallback. Não foi observado desconto de cache nos relatórios de uso dessa rodada.

## Pendências reveladas

1. Fazer reação, escolha e correção encerrarem naturalmente sem anexar atendimento. Uma blacklist não resolve intenção conversacional.
2. Curar e recuperar exemplos menores e variados por contexto, medindo desempenho em falas novas. A repetição literal dos exemplos hoje mascara parte dos acertos.
3. Tornar callbacks e iniciativas mais específicos ao assunto confirmado e menos parecidos com consultoria; fatos e exemplos devem continuar separados.
4. Reduzir a fala padrão e melhorar os critérios de indicação, sem perder justificativa sob pedido.
5. Rever a confiabilidade do contrato de metadados e medir primeiro texto utilizável separadamente de geração completa antes de atribuir toda demora à rede.

Antes de ampliar autonomia, a recomendação desta avaliação é validar essas interações encadeadas com a pessoa. A infraestrutura de presença pode funcionar enquanto a atuação ainda precisa de refinamento.

## Artefatos locais

Em `code/backend/api/data/refinement/`, ignorados pelo Git:

- `1791399166633-conversation-quality.{json,md}` — linha de base, 33 turnos.
- `1791399660444-conversation-quality.{json,md}` — primeira revisão, 13 turnos críticos.
- `1791399909239-conversation-quality.{json,md}` — revisão final, 41 turnos.
- `1791400238345-conversation-quality.{json,md}` — lembrança explícita e interrupção, quatro turnos finais.
- `2026-10-07-presenca-transcricao-final.md` — as 18 conversas finais reunidas para leitura.
