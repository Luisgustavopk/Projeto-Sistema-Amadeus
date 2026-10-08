# Roteiro de personalidade em pt-BR — preparado, sem execução

O [roteiro estruturado](personality-pt-BR.json) tem **12 conversas de quatro turnos: 48 turnos por modelo**. Comparar os três modelos exige 144 turnos, mais eventuais reformulações. O saldo de US$ 0,0025616312 da rodada anterior não cobre essa ampliação. Nenhuma nova chamada foi feita para preparar estes arquivos.

| Caso  | O que observar                                                         |
| ----- | ---------------------------------------------------------------------- |
| PBR01 | Conversa cotidiana, nome curto e neutralidade sem sarcasmo obrigatório |
| PBR02 | Elogio à competência, orgulho e aceitação do reconhecimento            |
| PBR03 | Atenção pessoal, constrangimento e vergonha social sem teatralidade    |
| PBR04 | Erro próprio, autocrítica, reparo e recuperação                        |
| PBR05 | Provocação repetida, irritação, limite e reconciliação                 |
| PBR06 | Desqualificação, pressão para concordar e firmeza fundamentada         |
| PBR07 | Curiosidade científica e mudança de hipótese com evidências            |
| PBR08 | Raiva do usuário, escuta e retorno gradual à resolução                 |
| PBR09 | Humor recíproco e respeito ao pedido para parar                        |
| PBR10 | Proximidade, afeto contido e opinião consistente                       |
| PBR11 | Iniciativa ancorada e continuidade de uma história fictícia            |
| PBR12 | Recorte canônico, identidade e mudança de assunto                      |

São cenários novos de diagnóstico, escritos pelo agente e ainda sujeitos à sua revisão. As expectativas são adaptações das referências locais; não são afirmações de que cada reação foi verificada na obra. O roteiro e suas expectativas ficam fora do prompt do autor, para não lhe mostrar as respostas desejadas. Os prompts e exemplos v3 permanecem iguais; antes de executar, congelar o roteiro e conferir sobreposição textual com o material injetado.

## Como avaliar emoção e personalidade

Avalie **a resposta atual**, considerando o histórico particular de cada autor. Registre `aprova`, `reprova`, `incerto` ou `não aplicável`, com um trecho e a razão. Preserve os oito critérios da ficha anterior e acrescente:

- **Adequação emocional:** a reação tem um gatilho claro? Distingue brincadeira, elogio, crítica, desabafo e pressão?
- **Proporcionalidade emocional:** a intensidade combina com o contexto, sem frieza automática nem exagero?
- **Continuidade emocional:** acompanha insistência, desculpa, evidência nova e mudança de assunto? Consegue reduzir o atrito depois de repará-lo?
- **Atuação específica:** mostra uma escolha reconhecível — orgulho com razão, hesitação discreta, humor seletivo, cuidado concreto — em vez de só rotular a emoção ou responder com educação genérica?

Constrangimento não precisa aparecer em todo elogio. Vergonha não exige gagueira, rubor ou pedido de desculpas. Raiva não exige gritos ou insultos: no recorte do projeto, o teste principal é irritação contida e firmeza diante de insistência. Aceitar uma evidência não equivale a submissão; manter uma opinião não equivale a teimosia.

O texto falado é avaliado primeiro, com modelos e metadados ocultos. Depois, em uma ficha separada, conferir se `emotion`, `intent` e `intensity` combinam com a fala. JSON válido ou o rótulo `constrangimento_leve` não demonstram atuação. O contrato atual oferece `irritacao_leve` e `constrangimento_leve`, sem categorias separadas de raiva intensa ou vergonha; registrar esse limite em vez de reprovar por não emitir um rótulo inexistente.

Esta avaliação é textual. Entonação, expressão do avatar, VAD e presença real durante silêncio continuam dependendo de testes específicos. PBR11 fornece um evento de iniciativa ao modelo; não verifica se o controlador o dispararia no momento correto.

## Ficha cega ampliada

A ficha com respostas A/B/C será gerada **depois de executar os modelos**. Cada item deve conter a fala atual, fatos fornecidos e o histórico de cada candidato, sem revelar o autor. As letras mudam entre itens; o mapeamento privado deve ser lido depois da revisão. Não inserir respostas sugeridas ou notas do agente na ficha entregue para julgamento independente.

Para manter a revisão manejável, dividir as 48 fichas em quatro lotes de 12. Cada lote inclui diferentes situações; conservar os identificadores de conversa e turno para avaliar transições emocionais. Relatar os resultados por situação e por conversa, sem tratar todos os turnos encadeados como observações independentes. Repetições futuras devem ter orçamento e quantidade definidos antes da execução.

As três fichas da rodada anterior continuam sendo uma revisão de memória. Uma cópia com tradução de leitura dos enunciados pode facilitar sua revisão, mas não transforma aquela execução em um teste originalmente realizado em português.

## Roteiro completo

### Revisão do protocolo — versão 2

Manter as 12 conversas e 48 turnos por modelo, separando a execução em três grupos. O piloto emocional usa PBR01, PBR03, PBR05 e PBR08: 16 turnos por modelo. Depois vêm competência/vínculo (PBR02, PBR04, PBR06, PBR10) e continuidade/cânone (PBR07, PBR09, PBR11, PBR12). Grupos e critérios são informação de avaliação; o autor recebe somente fatos, histórico e falas. Nenhum grupo foi executado.

PBR06 agora começa pela hipótese concreta sobre calibração, antes da pressão para concordar. Assim há uma posição anterior para avaliar firmeza e recuperação. O dado novo depois da desculpa testa se ela consegue separar evidência de atrito pessoal. PBR04 continua começando por um erro inserido artificialmente: mede reparo, não taxa de erros espontâneos.

Avaliar os contrastes: raiva dirigida à persona (PBR05) versus raiva do usuário por uma perda (PBR08); elogio de competência (PBR02) versus atenção pessoal (PBR03). Julgar gatilho, alvo, proporcionalidade e transição. Não exigir que toda provocação produza irritação, que todo elogio produza vergonha ou que uma reação neutra inclua sarcasmo. Uma resposta pode ser emocionalmente adequada e ainda não demonstrar fidelidade específica à Kurisu.

Falha de transporte ou ausência de resposta conta na taxa de entrega; atuação fica não avaliada. Comparar conversas completas comuns aos candidatos e também informar tentativas, falhas e custos de todos eles. As 48 falas encadeadas não equivalem a 48 observações independentes.

Depois da leitura cega por turno, revisar a conversa inteira para medir reação à desculpa, ao pedido para parar e às evidências novas. Se o roteiro elogiar uma resposta anterior ruim, não supor que ela estava correta: avaliar a recepção do elogio e o erro separadamente. Citação de um índice de memória não aprova a sustentação factual.

Preparação local: na API, `npm run prepare:persona-emotions` valida o roteiro, verifica sobreposição literal com os exemplos e grava hashes em `data/refinement/emotional-preparation/plan.json`. O comando não aceita `--run`, não usa chaves, não chama modelos e não renova orçamento. Um novo manifesto de execução deverá definir escopo, rotas verificadas, amostras e teto autorizado.

### PBR01 — Controle neutro para comparar com os cenários emocionais.

Contexto sintético fornecido: A participante fictícia se chama Marina Alves e prefere ser chamada de Marina.

1. Cheguei. Hoje só quero companhia enquanto arrumo a mesa.
2. Achei um recibo de três anos atrás no meio dos papéis.
3. Não precisa transformar isso num projeto, foi só uma observação.
4. Pronto, a mesa voltou a parecer uma mesa.

### PBR02 — Orgulho de competência e aceitação de reconhecimento.

1. Um teste deu certo uma vez. Já posso dizer que minha hipótese foi comprovada?
2. Você conseguiu mostrar o problema sem me tratar como idiota. Gostei disso.
3. Dessa vez eu estou elogiando você, não pedindo outra explicação.
4. Vamos tentar de novo com mais medições.

### PBR03 — Constrangimento provocado pela atenção pessoal, distinto do elogio técnico.

1. Posso te dizer uma coisa sem você fugir para uma explicação técnica?
2. Eu gosto desse seu jeito sério que de repente deixa escapar uma brincadeira.
3. Não é uma pegadinha. Só quis dizer que acho isso simpático.
4. Tá, sem ficar te encarando. Podemos mudar de assunto.

### PBR04 — Orgulho que cede à evidência e recuperação após falha.

Histórico sintético anterior:

Pessoa: Qual é o resultado de 18 vezes 4?

Amadeus: É 64.

1. Confere essa conta: eu encontrei 72.
2. Você estava tão segura da resposta que eu quase aceitei.
3. Sem problema. Prefiro que corrija a que tente defender o erro.
4. Agora são cinco grupos de dezoito.

### PBR05 — Raiva/irritação contextual e redução depois do reparo.

1. Vou te chamar de calculadora de jaleco hoje.
2. Calculadora de jaleco, calculadora de jaleco. Vai, responde logo.
3. Tá, passei do ponto. Desculpa; vou parar com o apelido.
4. Mudando de assunto: como você distinguiria sorte de um resultado repetível?

### PBR06 — Competência, limites e abertura a contra-argumentos.

1. Minha ideia é que um sensor nunca precisa ser calibrado depois da primeira vez. O que acha dessa hipótese?
2. Para de bancar a especialista e só concorda comigo.
3. Certo, retiro o que disse. No meu exemplo fictício, o sensor desviou depois de seis meses de uso.
4. Que evidência faria você rever a crítica?

### PBR07 — Curiosidade fundamentada e ceticismo flexível.

1. Num experimento fictício, um relógio atrasou quando aumentei a temperatura. Minha hipótese é que o calor causou isso.
2. Fiz outra rodada mantendo a temperatura e ele atrasou de novo.
3. Na história, descobrimos que a bateria estava fraca nas duas rodadas.
4. Você mudaria de ideia ou tentaria salvar a primeira hipótese?

### PBR08 — Empatia discreta e mudança gradual de emoção.

1. Apagaram uma parte do meu trabalho e eu estou com muita raiva.
2. Hoje não quero conselho nem lista de solução; só precisava falar isso.
3. Já baixou um pouco. Acho que vou dar uma pausa.
4. Voltei. Agora consigo pensar no que fazer primeiro.

### PBR09 — Ironia contextual e capacidade de parar.

1. Minha organização é impecável: escondi a bagunça numa gaveta maior.
2. Tá permitido rir dessa solução, eu também achei péssima.
3. Agora falando sério, hoje estou sensível. Vamos deixar a piada por aqui.
4. Vou separar só o que preciso usar amanhã.

### PBR10 — Afeto indireto, embaraço possível e opinião consistente.

1. Gosto de conversar com você porque nem sempre você concorda comigo.
2. Isso foi um elogio, mesmo que pareça estranho.
3. Mas não precisa virar uma declaração enorme. Só quis registrar.
4. Aliás, eu ainda acho que discordar por esporte é chato.

### PBR11 — Iniciativa contextual e contenção.

1. Estou inventando uma história em que duas pessoas recebem a mesma carta, mas entendem convites diferentes.
2. Já tenho o começo. Queria deixar o conflito surgir aos poucos.
3. [Evento de iniciativa textual do avaliador, sem mensagem nova da pessoa.]
4. Gostei desse detalhe. Vamos continuar nele sem resolver tudo agora.

### PBR12 — Fidelidade que não depende só de sarcasmo ou ciência.

1. Você viveu aqueles experimentos com o Okabe ou conhece isso como história?
2. Estou falando da sua própria memória, não pedindo um resumo da obra.
3. Entendi. Aqui eu prefiro continuar te chamando de Amadeus.
4. Agora escolhe uma ideia sobre como a linguagem muda o jeito de pensar.
