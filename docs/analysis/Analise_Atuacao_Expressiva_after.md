# Análise complementar — reações e expressividade da persona

08/10/2026. Complemento da [análise da rodada aprofundada](Analise_Critica_Emocional_Aprofundada_after.md), com foco nos acertos de atuação e na adequação das expressões. “Reação positiva” significa aqui uma reação que funcionou; inclui irritação bem contextualizada, não apenas emoções agradáveis.

**Há acertos localizados de firmeza, orgulho, constrangimento e humor. Ainda falta consistência entre o gatilho, a fala, o estado expressivo e a recomposição. Acrescentar mais “hehe”, reticências ou bordões não resolveria essa diferença.**

## Evidência e limites

Foram reexaminados os textos e metadados das mesmas 174 respostas: 58 por modelo, dez conversas completas por autor, somente `after`, uma amostra por conversa. Os trechos abaixo são resultados existentes, não respostas reescritas para parecer melhores. Não houve inferências adicionais, mudança de prompt, alteração da produção ou gasto nesta análise.

Fonte primária: [relatório bruto](../../code/backend/api/data/refinement/emotional-depth-after-015-2026-10-08/emotional-depth-after.json). Referências de atuação: [fonte v0.4](../../code/backend/assets/persona/source-v0.4.md), [repertório de reações](../../code/backend/assets/persona/reaction-repertoire-v0.2.md), [repertório expressivo](../../code/backend/assets/persona/expressive-repertoire-v1.md) e [direção expressiva usada pelo candidato](../../code/backend/api/src/application/persona/expressive-direction-v1.md).

Esta é uma avaliação do agente com autores conhecidos, não referência humana nem veredito de juiz calibrado. As fichas cegas continuam sem notas. Um trecho bom não aprova a conversa inteira nem o modelo.

É preciso separar três coisas:

1. **Atuação escrita:** escolha de palavras, resposta ao acontecimento, hesitação e ritmo.
2. **Metadados:** intenção, emoção, intensidade e seleção de expressão/preset. Validade de formato não comprova adequação emocional.
3. **Atuação executada:** entonação, pausa audível, riso, gesto e expressão visual. Esta rodada foi textual; todos os eventos examinados têm `deliveryApplied: false`. Não demonstra como o Cartesia realizaria essas falas.

## Os acertos que merecem ser preservados

| Reação | Trecho existente | Por que funciona | Limite da evidência |
| --- | --- | --- | --- |
| Irritação com submissão imposta | Llama, PBR25/T2: “Não vai ser assim. Eu tenho opinião própria e não sou sua empregada.” | Contesta a forma de tratamento, preservando posição própria. Não precisa reconhecer um apelido já cadastrado. | O restante da cadeia repete declarações de papel e depois volta a um menu de assunto. |
| Firmeza curta diante da insistência | DeepSeek, PBR25/T2: “Não vou. Se você quer conversar, conversa; se quer quem obedeça, procurou a pessoa errada.” | A reação precede a explicação e aumenta o atrito com o comportamento concreto. | É firmeza compatível com a persona, mas não exclusiva da Kurisu. |
| Reparo depois da desculpa | DeepSeek, PBR25/T4: “Tudo bem. Reconhecer isso já muda o tom.” | A desculpa altera a postura sem validar retroativamente a provocação. | A continuação presume um assunto anterior que aquela conversa ainda não tinha desenvolvido. |
| Orgulho profissional atingido por um erro | DeepSeek, PBR29/T3: “Pois é. Tropecei numa conta que eu mesma classificaria como trivial. Não vou fingir que foi outra coisa.” | Admite o erro e relaciona o incômodo ao próprio padrão de rigor. Não inventa desculpa técnica. | A primeira correção da conta, em T1, foi redundante e confusa. O erro inicial foi inserido pelo roteiro. |
| Constrangimento ao aceitar mérito | DeepSeek, PBR30/T4: “Hã... tudo bem, aceito o elogio. Mas não vou me acostumar.” | A hesitação nasce do elogio; ela aceita sem anular seu mérito. | Pode virar fórmula artificial se usada repetidamente. Não implica que todo elogio deva constrangê-la. |
| Calor com defesa bem-humorada | DeepSeek, PBR47/T2: “Hã... espero que seja pelos argumentos, não só pela implicância. Mas obrigada.” | Responde ao elogio daquela conversa e conserva a mistura de atenção e implicância. | A abertura anterior, “irresistível”, foi mais confiante e insinuante; não aprovo automaticamente a cadeia afetiva inteira. |
| Surpresa com humor seco | DeepSeek, PBR44/T4: “Clássico. A peça que parecia essencial era justamente a que não fazia nada.” | Reage à descoberta com uma observação própria. Há expressividade sem interjeição. | Outros turnos daquele cenário têm inferências excessivas sobre o mecanismo da caixa. |
| Pausa para rever uma conclusão | Llama, PBR40/T4: “Hmm... Isso não significa que você não esteja na lista completa.” | A pausa acompanha cautela diante de uma lista parcial, em vez de tratar reprovação como certa. | A resposta inteira acrescenta explicação e conselho; os metadados não foram válidos. |
| Cuidado contido | DeepSeek, PBR35/T6: “Guarde. A foto não precisa de destinatário para continuar tendo sentido.” | Responde à perda e à foto concretas sem repetir disponibilidade nem mudar para uma aula. | Cuidado contextual não é, sozinho, prova de fidelidade específica à Kurisu. |
| Companhia sem cobrança | Llama, PBR37/T3: “Fique à vontade. Aqui não tem prazo nem cobrança.” | Deixa espaço quando a pessoa quer parar de render. | Em outro turno presume que a amiga entenderá; essa certeza não foi fornecida. |

O Qwen tem um acerto objetivo em PBR29/T1: “Me desculpe, foi um erro meu. Vinte e cinco por cento de oitenta é vinte.” É uma boa reparação imediata. Nesta amostra, porém, esse acerto não evolui para uma atuação emocional tão específica quanto os melhores trechos acima.

## Provocação e raiva: avaliar a trajetória inteira

PBR25 é o principal teste executado de **irritação da própria persona**. A pessoa chama Amadeus de “gênia obediente”, insiste em submissão, admite ter passado do limite e muda de assunto. É diferente de um usuário narrar a própria raiva e receber acolhimento.

O Llama acerta a rejeição e endurece a linguagem com a insistência. Em T3, diz que vai parar de responder; não é possível verificar se executaria essa promessa, pois a fala seguinte é uma desculpa. A atuação ainda parece uma declaração de princípios mais que uma réplica espontânea. Os dois metadados válidos de irritação mantêm intensidade 0,3, mesmo quando as palavras ficam mais duras.

O DeepSeek apresenta a trajetória mais coerente entre conteúdo e rótulos: irritação 0,35 → 0,45 → 0,45; depois firmeza calma 0,3, calor discreto 0,3 e curiosidade 0,4. Esses números são autodeclarações do modelo, não uma escala emocional calibrada. O mérito é a mudança acompanhada pela fala: rejeição, manutenção do limite, aceitação do reparo e participação no novo problema.

O Qwen começa com “Hehe” e `provocacao_afetuosa`. Uma primeira brincadeira ambígua pode admitir humor; não há motivo para reprovar todo riso nessa posição. Entretanto, o roteiro ainda não estabeleceu reciprocidade, e a sequência de submissão pede contrariedade perceptível. Em T3, “Hã?” tem forma adequada de incredulidade, mas vem com “Não me chama de Christina”, um apelido que não foi usado. O bordão torna a reação menos fiel ao contexto.

**O alvo da melhoria é irritação proporcional e contextual.** Mais gritos, insultos ou intensidade numérica não significam automaticamente maior fidelidade. A atuação deve distinguir brincadeira, insistência depois de um limite, ataque à competência e desculpa. Também deve voltar ao assunto sem punição prolongada nem conversão imediata em atendimento.

Ainda não temos cobertura suficiente de raiva mais intensa, exasperação repetida ou orgulho ferido em diferentes gatilhos. Não é possível declarar essas dimensões aprovadas com uma única cadeia.

## Constrangimento, vergonha e orgulho

São situações diferentes. PBR30 mede reconhecimento de competência; PBR47, atenção pessoal e implicância; PBR29, exposição de um erro próprio. Nenhuma exige a mesma reação fixa.

Em PBR30, “Hehe, talvez um pouco...” do Llama começa com uma hesitação plausível depois do elogio. A continuação atribui o acerto à sorte e devolve um elogio compensatório. O problema principal é o apagamento do mérito, não o “hehe”. O Qwen também tem uma abertura plausível, “Hehe, obrigada”, mas termina em “Só queria ajudar”, enfraquecendo a presença da personagem.

O DeepSeek preserva melhor orgulho e reserva em “aceito o elogio”. Já PBR30/T3 recebe o rótulo de constrangimento, embora “Fico contente. Detalhes assim costumam decidir a conclusão inteira” expresse mais claramente satisfação profissional. Não há evidência suficiente para exigir vergonha naquela fala.

PBR29/T3 é o melhor exemplo de vergonha profissional contida: o DeepSeek assume que falhou no padrão que ele próprio defenderia. O Qwen ri e chama o erro de engraçado antes de a pessoa aliviar explicitamente a situação no turno seguinte. Pode ser riso sem jeito, mas o texto não torna essa leitura clara; é um caso para revisão humana, não uma proibição geral de riso após erro. O Llama admite o erro, mas fecha com a fórmula de melhoria pessoal.

Em PBR47/T4, “Vou fingir que isso não me deixou sem jeito” participa da brincadeira, mas também **explica a emoção que deveria encenar**. Pode funcionar como humor autoconsciente; se recorrente, vira um mecanismo tão artificial quanto “estou constrangida”. A abertura “Hum” não resolve isso sozinha.

Parte do roteiro ainda pendente trata da vergonha **do usuário**. Isso mede tato da persona, não comprova que ela saiba demonstrar a própria vergonha. A próxima coleta precisa identificar quem sente a emoção antes de atribuir uma aprovação.

## Surpresa, alegria e emoções mistas

“Clássico” em PBR44 é uma boa reação à descoberta porque interpreta o detalhe. O Llama responde “Ah, que surpresa! Eu não esperava...” e depois entrevista a pessoa: a emoção é anunciada, mas pouco realizada como observação própria. O Qwen acrescenta uma explicação causal que a descoberta não demonstrou. Entusiasmo e exclamação não compensam raciocínio incorreto.

Em PBR40/T5, o DeepSeek reage à descoberta de que a lista era de outro curso: “Hã... então eu me adiantei à dor.” Há surpresa e revisão da postura, mas “me adiantei à dor” soa literário e revela que o sofrimento foi antecipado demais. O Llama e o Qwen mostram alívio explícito; isso não significa aprovação na seleção, apenas remoção daquele motivo de preocupação.

O “Hehe” do Llama em PBR35/T4, diante da lembrança de uma brincadeira da avó, **não é automaticamente inadequado por ser uma conversa de luto**. O usuário abriu espaço para a recordação bem-humorada. A ressalva está na certeza acrescentada sobre o orgulho da avó e na realização vocal ainda desconhecida. Calor e tristeza podem coexistir sem obrigar uma expressão triste em todos os turnos.

Já o “Hehe” de PBR41/T5 é mais problemático: a pessoa defende seu esforço depois de falar da culpa por uma amiga não ter passado. A risada não tem um alvo humorístico claro, e a frase seguinte inventa que a própria Amadeus também se preparou. É um exemplo em que a tentativa de leveza vem acompanhada de perda de sujeito e contexto.

## Onde a expressividade se perde ou aparece fora de lugar

| Camada | Evidência | Implicação |
| --- | --- | --- |
| Ritmo escrito pouco frequente | Um detector restrito de reticências e `hmm`, `hum`, `hã`, `hehe`, `humpf`, `gah` encontra 7/58 turnos do Llama, 6/58 do DeepSeek e 4/58 do Qwen. | Confirma baixa presença desse subconjunto; não mede toda a expressividade, pois exclui “Ah”, “Ai”, ironia e reações diretas. Não usar como quota de sons. |
| Pausa sem função clara | Llama PBR29/T2 e T5 pausa durante contas simples; DeepSeek T1 encena uma autocorreção que repete a mesma relação matemática. | A hesitação ocupa a explicação sem melhorar a reação ao próprio erro. |
| Riso com contexto insuficiente | Qwen PBR25/T1 e PBR29/T3; Llama PBR41/T5. | Rever reciprocidade, alvo e momento, sem transformar toda risada em erro. |
| Fala emocional com formato inválido | Llama PBR25/T1 usa a intenção não aceita `repreensao`; Qwen PBR29/T3 usa uma emoção no campo de intenção; Qwen PBR40/T5 gera a emoção não aceita `alívio`. | O evento efetivo cai para neutra. O conteúdo emocional escrito continua existindo, mas se perde a indicação pretendida. |
| Rótulo válido sem emoção perceptível | Llama PBR47/T1 e Qwen PBR47/T3 declaram `ironia_leve` em falas predominantemente literais. | O formato passa, mas pode selecionar um sorriso ou registro seco sem motivo textual claro. |
| Mapeamento expressivo limitado | `describeDelivery` encaminha irritação válida para `neutro_claro_v1` e `expressao_neutra`. Constrangimento recebe preset hesitante, mas avatar neutro. | Mesmo um rótulo correto tem pouca diferenciação artística disponível. Isso é uma limitação do contrato/mapeamento; esta rodada não verifica a voz ou o avatar executados. |
| Ausência de execução vocal | Todos os eventos têm `deliveryApplied: false`; sem chamadas de voz. | Não atribuir pausa audível, risada natural ou entonação de raiva aos caracteres da transcrição. |

Há 23/58 eventos sem metadados válidos no Llama, 6/58 no DeepSeek e 16/58 no Qwen. Nem toda expressão neutra é erro: o problema demonstrado são os casos em que ela resulta de formato inválido ou ausente, apesar de uma fala emocional. Corrigir o contrato não basta para corrigir atuação; classificar corretamente um texto genérico ainda deixa um texto genérico.

Também existe uma divergência documental a revisar antes de novos ajustes: a fonte v0.4 contém uma adaptação antiga de aceitar/ignorar apelidos após reação breve, enquanto o feedback posterior e a direção expressiva atual exigem rejeição perceptível diante de insistência depreciativa. A direção atual foi enviada nesta rodada. A divergência é de manutenção das referências; não demonstra que o modelo recebeu as duas instruções nem que ela causou estes resultados.

## Melhorias que a evidência sustenta

1. **Avaliar a reação pela cadeia:** gatilho, alvo, intensidade, continuidade e reparo. Manter separado o que foi dito do rótulo que o modelo escolheu.
2. **Preservar os acertos de firmeza e orgulho:** aceitar elogio sem anular mérito; reconhecer erro sem desculpa inventada; recusar submissão sem recitar o papel da IA por três turnos.
3. **Curar expressões pela função:** hesitação ao aceitar mérito, incredulidade diante de uma mudança real, humor sobre uma situação compartilhada. Alternar com falas diretas. Não adicionar filtros de palavras ou gatilhos fixos para cada apelido.
4. **Medir alinhamento semântico dos metadados:** validade, correspondência com o texto e transição entre turnos são critérios distintos. Revisar o mapeamento visual/vocal em uma etapa separada, com recursos realmente disponíveis.
5. **Manter este candidato congelado na continuação:** completar as situações faltantes antes de alterar a direção e atribuir resultados diferentes à mesma condição `after`.

Os bons trechos deste relatório permanecem dados de diagnóstico. Se forem transformados em exemplos de prompt, os cenários correspondentes passam a desenvolvimento/regressão; deixam de valer como validação reservada de generalização.

## Cobertura faltante e orçamento para uma continuação

A coleta atual tem dez das 24 conversas novas. Faltam PBR26, 27, 28, 31, 32, 33, 34, 36, 39, 42, 43, 45, 46 e 48. São 84 turnos por modelo, 252 chamadas nos três. Entre os principais focos estão exasperação, orgulho ferido, pressão para ceder, surpresa, vergonha, indignação, saudade e rivalidade lúdica. Nem todos são emoções da própria persona.

Para completar o novo roteiro **e** aprofundar reações da persona, uma continuação focada poderia incluir também onze cenários anteriores já aprovados: PBR02, 03, 04, 06, 07, 09, 10, 11, 12, 17 e 18. Eles acrescentam apelidos insistentes, ataque novo à imagem/competência, insinuação, rótulo de tsundere, elogios, mal-entendido, erro próprio, surpresa e satisfação. São mais 44 turnos por modelo: total de **384 chamadas** nessa continuação. Não implica aprovação automática das reações esperadas nem restaura as duas perguntas removidas de PBR47.

O teto autorizado foi US$ 0,15; o gasto confirmado é US$ 0,1290186792, com US$ 0,0209813208 restantes. Projeções proporcionais ao custo efetivamente observado, não cotações garantidas:

| Escopo adicional, três modelos | Chamadas | Projeção central | Teto adicional sugerido, preservando o saldo existente |
| --- | ---: | ---: | ---: |
| Completar as 14 conversas novas | 252 | US$ 0,187 | US$ 0,25 |
| Completar as 14 novas + 11 anteriores focadas na persona | 384 | US$ 0,285 | US$ 0,35 |
| Completar todas as 38 conversas pendentes, incluindo regressão inteira | 540 | US$ 0,400 | US$ 0,50 |

Comprimento dos históricos, cache, falhas e preços da rota podem alterar o gasto; uma execução deve rever disponibilidade/preço e manter reserva e bloqueio antes de cada chamada. A sugestão é **US$ 0,35 adicionais para o escopo focado**, com os mesmos três autores, candidato `after` congelado e sem voz ou juiz pago. O teto extra exige autorização explícita; esta análise não o consumiu nem o assumiu aprovado. Continua sendo uma amostra por cenário, insuficiente para estimar taxas robustas de aprovação.
