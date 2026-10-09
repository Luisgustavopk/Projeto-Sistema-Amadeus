# Atuação, classificação emocional e segmentação — v9

## Escopo e custo

Nova rodada autorizada com teto de **US$ 0,15**. Foram realizadas **300 chamadas pagas**, somente textuais: 104 gerações de resposta, 104 classificações, 12 sondagens de recuperação e 80 avaliações do Jev. Todas terminaram com uso reportado; nenhuma cobrança ficou pendente. Nenhuma chamada Cartesia, STT ou teste de voz foi executado. Não foram usados dados pessoais do banco.

| Etapa | Gasto reportado |
| --- | ---: |
| Gerações principais | US$ 0,0208002480 |
| Classificadores | US$ 0,0048217792 |
| Sondagens de recuperação | US$ 0,0018653840 |
| Jev | US$ 0,0182499240 |
| **Total** | **US$ 0,0457373352** |
| **Saldo do teto desta rodada** | **US$ 0,1042626648** |

O orçamento foi compartilhado entre etapas, com reserva durável antes de cada requisição e reconciliação pelo custo informado. As sondagens e o Jev não renovaram o teto. A rodada anterior e seus manifestos permaneceram preservados.

## Método

Seis conversas inéditas em pt-BR, com 26 turnos: quatro de desenvolvimento e duas reservadas. Foram testados provocação insistente e reparo, elogio pessoal e constrangimento, decepção e silêncio, dúvida causal, surpresa e correção da notícia, pressão para concordar. Cada conversa foi executada com Llama e DeepSeek e dois bancos de exemplos, totalizando 24 conversas e 104 respostas. Houve **uma amostra por célula**; os turnos encadeados não são observações independentes.

- Llama: `meta-llama/llama-3.3-70b-instruct`, rota `deepinfra/turbo`, tetos de US$ 0,10/0,32 por milhão de tokens de entrada/saída.
- DeepSeek: `deepseek/deepseek-v4.1-flash`, rota `deepinfra/fp8`, tetos de US$ 0,14/0,42, raciocínio desativado.
- Núcleo, direções, temperatura 0,6, máximo de 512 tokens e formatos permaneceram iguais entre os braços de atuação. As rotas e os preços foram conferidos no catálogo antes da rodada principal.
- O controle usa o banco v7; o revisado substitui sete cenas por sequências editoriais curtas, preservando a origem da função. As frases novas não são traduções nem falas canônicas.
- Ambos usam a mesma seleção de funções, preparada a partir das falas do usuário, e o mesmo renderizador com **cenas agrupadas como dados fora do histórico real**. Assim, a comparação de atuação varia o conteúdo das cenas. Os históricos próprios divergem depois de cada resposta, como em uma conversa real.
- A classificação compara os dois prompts sobre **o mesmo primeiro segmento de 700 ms, mesmo usuário e mesmo histórico**. O observador é DeepSeek, temperatura zero. Executado separadamente da geração para isolar semântica e tempo de geração; não mede atraso de metadados em execução paralela ao áudio.
- A segmentação compara os prazos de 700 e 200 ms **ao vivo sobre o mesmo fluxo de chunks**, por dois consumidores, sem uma segunda chamada de geração.

A seleção e o renderizador diferem do experimento v8. Não cabe atribuir diferenças v8 → v9 exclusivamente ao novo banco ou comparar os tempos como uma melhoria de produção. Na v9, a preparação da recuperação foi feita antes da medição da geração: mediana 51 ms, p95 76 ms, após aquecimento. Os números abaixo excluem essa preparação, STT e TTS.

O manifesto principal foi congelado antes das requisições: `8b33c6c52ba00b40ef77d0b9e4159791f44434c14be97b900123d03a4adbc188`. Correções posteriores de lint tornaram explícitos imports Node e `globalThis`; os executores usados nas chamadas foram arquivados em `runner-snapshots/` e seus hashes foram conferidos contra os manifestos. `post-run-runner-revision.json` registra a diferença sem reescrever o contrato pago ou repetir chamadas.

A auditoria literal posterior não encontrou perguntas inteiras de quatro ou mais palavras nem sequências de oito palavras do roteiro nos documentos e exemplos elegíveis. Foi registrada em `post-run-contamination-audit.json`, sem alterar prompts ou repetir chamadas. Isso exclui apenas essa sobreposição literal; não demonstra independência temática nem substitui revisão humana.

## Atuação: exemplos revisados não bastam

| Medida | Llama controle | Llama revisado | DeepSeek controle | DeepSeek revisado |
| --- | ---: | ---: | ---: | ---: |
| Turnos | 26 | 26 | 26 | 26 |
| Palavras, mediana | 37 | 38,5 | 18 | 22 |
| Palavras, p95 | 120 | 113 | 35 | 65 |
| Frases, mediana | 4 | 4 | 2 | 3 |
| Perguntas por turno | 0,85 | 1,15 | 0,42 | 0,42 |

Há reação à provocação: ambos impõem limites e aceitam desculpas. O Llama revisado expressa irritação perceptível após insistência, mas também prolonga a resposta, exige uma desculpa e devolve perguntas. O DeepSeek mantém resposta mais seca, embora depois do reparo ainda devolva perguntas de assunto em alguns turnos. Firmeza e irritação apareceram; isso não significa que todos os momentos foram proporcionais ou fiéis.

No elogio pessoal, DeepSeek responde com reserva em alguns momentos; Llama frequentemente explica o próprio jeito e pressupõe que não costuma receber elogios. Na escuta, DeepSeek reconhece que a pessoa não quer uma lição nem uma solução; Llama oferece menus e disponibilidade mesmo depois do pedido de silêncio. A troca dos exemplos **não resolveu concisão nem atendimento**.

Continuam falhas de sustentação e continuidade:

- Ao mencionar um quebra-cabeça pela primeira vez, Llama presume que a pessoa vinha trabalhando nele há algum tempo. DeepSeek pergunta por “aquele que estava faltando peça” sem que isso tivesse sido registrado. A fronteira de cenas reduz mistura de papéis, mas não garante que o autor resolva corretamente uma referência ambígua.
- Em V06, DeepSeek relata uma experiência própria não fornecida (“eu também já me peguei…”), depois diz que não havia afirmado que também fazia isso. Há contradição dentro do histórico.
- Em V04, ambos desenvolvem explicações longas; a recuperação seleciona funções genéricas em vez do exemplo de evidência em vários turnos. Dizer algo científico não demonstra a atuação desejada.
- A correção de notícia em V05 não foi medida por um verificador factual independente. O exemplo revisado favorece reconhecer que uma menção ainda pode ser boa notícia, mas não autoriza presumir o julgamento de quem montou o mural.

As sobreposições literais de oito palavras foram duas no Llama de cada braço e zero no DeepSeek. Podem representar imitação de atuação, não necessariamente transferência de fatos. A ausência de cópia literal também não exclui inferências indevidas. **Naturalidade e fidelidade não estão aprovadas por esta rodada.**

## Classificação: melhor discriminação candidata, sem gabarito novo

As 104 propostas foram válidas no contrato. O enum não foi reduzido e a intensidade continua livre entre 0 e 1. A versão revisada explica que a emoção é da reação da persona, com referências de força expressa e interpretação de insistência/reparo.

| Indicador | Controle | Com referências de intensidade |
| --- | ---: | ---: |
| Propostas válidas | 52/52 | 52/52 |
| Intensidade exatamente 0,5 | 41/52 | 4/52 |
| Intensidade mediana | 0,5 em ambos os autores | 0,4 em ambos os autores |

O prompt revisado produziu nove valores distintos; 20/52 ainda ficaram em 0,4. Portanto, reduzir o acúmulo em 0,5 não comprova calibração. A ficha nova inclui histórico, trecho observado, resposta completa e proposta anterior para julgar as transições, que não haviam sido avaliadas na v8.

Em V01, com o Llama, a sequência revisada foi `irritacao_leve / 0,4` → `irritacao_leve / 0,45` → `irritacao / 0,7` → `firmeza_calma / 0,35` após desculpa. No DeepSeek: `irritacao_leve / 0,4` → `irritacao_leve / 0,45` → `impaciencia / 0,6` → `alivio / 0,4`. São trajetórias plausíveis para revisão, não notas humanas aprovadas.

O controle também reconheceu irritação em algumas dessas falas: a ausência na v8 não vinha apenas do prompt do observador, pois depende da atuação que ele recebe. Em V03, o revisado deixou de atribuir diretamente a tristeza relatada pelo usuário à persona e classificou acolhimento como calor discreto. Em V04 houve distinção de dúvida e ceticismo, mas uma classificação de ironia ainda merece revisão pelo trecho observado.

As medianas de duração do observador revisado foram 0,95 s sobre falas do Llama e 0,92 s sobre falas do DeepSeek. O controle foi sempre executado primeiro; ordem, cache e variação remota limitam a comparação de tempo. Esses valores **não são a latência adicional de uma fala ao vivo**, porque os classificadores foram executados em uma etapa separada.

## Segmentação: benefício maior no DeepSeek

Mediana e p95 do primeiro segmento utilizável, em segundos:

| Autor e braço | 700 ms: p50 / p95 | 200 ms: p50 / p95 |
| --- | ---: | ---: |
| Llama controle | 1,61 / 8,82 | 1,57 / 8,82 |
| Llama revisado | 1,72 / 4,34 | 1,64 / 4,34 |
| DeepSeek controle | 1,20 / 1,71 | 1,01 / 1,71 |
| DeepSeek revisado | 1,30 / 3,13 | 1,09 / 3,13 |

O ganho mediano **pareado por resposta** foi aproximadamente zero no Llama, 22 ms no DeepSeek controle e 215 ms no DeepSeek revisado. Diferença entre medianas agregadas não é mediana dos ganhos individuais. Diferenças negativas de microssegundos entre consumidores são ruído de escalonamento.

As 104 respostas preservaram o mesmo texto nas duas segmentações; os primeiros segmentos terminaram com pontuação de fim de frase. O prazo menor não cortou palavras nesses exemplos. Contudo, aumentou o número de segmentos: DeepSeek revisado passou de 38 para 50; controle, de 33 para 41. Llama teve um segmento adicional em cada braço. Isso pode alterar prosódia e número de requisições TTS e precisa de validação posterior em voz.

No Llama, a primeira frase longa e a geração continuam relevantes para o atraso: a mediana de geração completa no revisado foi 3,90 s. Houve picos de mais de 12 s no primeiro segmento de uma resposta do controle. Reduzir somente o temporizador não resolve esse comportamento. **O padrão de produção continua em 700 ms**; 200 ms é uma opção testada, não uma alteração silenciosa no Voice Test.

## Recuperação: reranqueamento não foi solução automática

Uma auditoria local de 18 turnos de desenvolvimento usou o reranqueador multilíngue já existente, sobre as descrições de função. A mediana após aquecimento foi 214 ms, com p95 de 341 ms; a primeira chamada levou 1,40 s.

Com o limiar e a janela de relevância atuais, **15/18 seleções ficaram vazias**. Alguns melhores candidatos também foram pouco pertinentes. O escore do reranqueador para documentos factuais não pode ser tomado como uma probabilidade calibrada de função de interação. Não foi baixado o limiar apenas para preencher três vagas.

Foram feitas 12 sondagens com os mesmos históricos e perguntas de desenvolvimento, os mesmos modelos, núcleo e amostragem, variando apenas os exemplos selecionados. Em dez delas a filtragem removeu todos os exemplos; nas duas de elogio manteve um exemplo de afeto. Portanto, boa parte desse teste compara três exemplos com nenhum, e não uma recuperação correta de três funções.

Houve melhora pontual: DeepSeek deixou de pressupor uma peça faltante no quebra-cabeça e fez uma pergunta sobre dificuldade. Persistiram perguntas genéricas e explicações longas; Llama ainda pressupôs que a outra planta não ouvia música, sem essa informação. Esta sondagem **não valida o reranqueador nem autoriza desativar o corpus**. Os turnos já vistos foram usados para diagnóstico, não reapresentados como teste reservado.

## Jev: controles melhores que o diagnóstico conhecido

- Referência pessoal confirmada, oito pares escolhidos para diagnóstico: **6/8** preferências concordantes. Continuou discordando nos mesmos itens de elogio pessoal e desculpa à professora (`00658235c548`, `4636bec448b2`). Não é uma amostra aleatória de calibração.
- Controles editoriais novos, com empates, ambas inadequadas e vitórias de A/B: **11/12**. Um empate entre respostas de gratidão virou preferência por B.
- Inversões: escolha remapeada estável em **6/6**. Estabilidade não demonstra que a escolha original estava certa.
- Nenhum conflito interno foi sinalizado pelo auditor de decisões; isso não comprova adequação dos vereditos.
- Novos pares entre autores: DeepSeek 15, Llama 11. Comparação de exemplos nas conversas reservadas: revisado ganhou oito, controle cinco, houve três empates. Sem notas pessoais novas, essas contagens são decisões do modelo, não taxas de aprovação de persona.
- Na sondagem de recuperação, preferência dividida em seis para cada condição; novamente sem gabarito humano.

Jev continua fora da seleção automática e fora do caminho que libera a fala.

## Artefatos e decisão

Diretório local ignorado pelo Git: `code/backend/api/data/refinement/reactions-v9-015/`.

- [Ficha de comparação somente após os ajustes: 26 pares entre autores](../../code/backend/api/data/refinement/reactions-v9-015/ficha-pos-ajustes.md).
- [Ficha completa: 26 itens, 104 respostas e os dois bancos](../../code/backend/api/data/refinement/reactions-v9-015/ficha-cega-completa.md).
- [Expressões e transições: 52 falas e 104 propostas](../../code/backend/api/data/refinement/reactions-v9-015/ficha-expressoes-transicoes.md).
- [Sondagem de recuperação: 12 pares com histórico idêntico](../../code/backend/api/data/refinement/reactions-v9-015/ficha-recuperacao-diagnostico.md).
- [Transcrições identificadas e contexto selecionado](../../code/backend/api/data/refinement/reactions-v9-015/transcricoes-completas.md).
- [Métricas e orçamento](../../code/backend/api/data/refinement/reactions-v9-015/summary.json), manifestos, chunks, entradas cegas e mapeamentos privados.

Implementado: prompt candidato de observação emocional, exemplos editoriais rastreáveis, agrupamento por cena, seleção semântica de funções, opção de prazo de segmentação, avaliação por fatores e fichas que expõem o escopo do observador e a transição temporal. Os testes de segmentação cobrem prazo padrão, liberação de frase completa e cancelamento.

**Não promover o pacote inteiro ao Voice Test:** o banco revisado não melhorou concisão e o seletor ainda recupera funções inadequadas. O classificador com referências de intensidade é candidato útil, condicionado à revisão de suas propostas; o prazo menor tem benefício medido especialmente no DeepSeek, condicionado à avaliação vocal posterior. O candidato de fala simples continua sem liberar fatos persistentes e não substitui a verificação factual de memória.

Próximo trabalho fundamentado: calibrar a representação e elegibilidade das funções com rótulos de relevância separados, limitar a extensão conversacional em um braço isolado e validar afirmações sobre referências ambíguas. Não multiplicar bordões nem introduzir regras por nomes. A promoção deve depender de revisão das fichas e de nova validação, não do escore do Jev nem da ausência de erros de schema.

## Verificação local

Formatação, lint e TypeScript passaram. A execução inicial de testes teve seis estouros do limite de cinco segundos ao iniciar 94 processos. Repetindo a suíte com `node node_modules/vitest/vitest.mjs run --maxWorkers=4`, passaram **633 testes em 94 arquivos**, sem ampliar o timeout nem alterar os testes de integração. O build passou. A conferência posterior confirmou 300 chamadas concluídas, manifesto íntegro e concordância entre ledger e resumo de custo. Nenhuma dessas verificações fez chamadas pagas adicionais.
