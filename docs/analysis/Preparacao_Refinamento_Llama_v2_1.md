# Preparação da avaliação do Llama v2.1

Atualização de 08/10/2026: o patch externo foi recebido e analisado posteriormente. Seus bancos foram preservados como candidatos separados, e as 30 notas humanas foram recebidas. A nova rodada tem US$ 0,25 autorizados no total. O registro e as limitações estão em [Calibração humana e rodada v2.1](Calibracao_Juiz_Llama_v2_1.md); as observações abaixo sobre ausência de notas e orçamento descrevem a preparação anterior.

Preparação autorizada em 07/10/2026, após análise do plano externo e do KurisuQA. A implementação foi feita sobre o executor existente; o patch mencionado no documento externo não foi recebido nem aplicado. O foco de atuação continua sendo o Llama 3.3 70B. **Nenhuma chamada de geração paga foi executada nesta preparação, e o prompt de produção permanece igual.**

## Perfil reproduzível do corpus

`npm run profile:persona-corpus` lê o CSV público da revisão `ebd640fdabf5616b6fde9c2fc12f9b9400ae0ceb` do [KurisuQA](https://github.com/Ibnelaiq/KurisuQA). O download é processado em memória; o CSV e o dicionário Python não são copiados para o projeto. Uma cópia local pode ser fornecida com `--csv=CAMINHO`, desde que corresponda ao SHA-256 da revisão fixada.

O resultado está em `code/backend/evals/persona/quality-v2.1/corpus-reference-profile.json`. Contém somente origem, hashes, definições e estatísticas. Distingue palavras separadas por espaços da tokenização lexical usada na avaliação; distingue presença de pergunta da quantidade de perguntas por unidade.

| Unidade em inglês                           | Amostras | Palavras por espaços p50/p90 | Unidades com pergunta | Terminam em pergunta |
| ------------------------------------------- | -------: | ---------------------------: | --------------------: | -------------------: |
| Linha do CSV KurisuQA                       |    2.834 |                         8/19 |                 29,6% |                23,7% |
| Bloco de fala preparado do corpus existente |      758 |                         9/36 |                 47,1% |                27,7% |

As diferenças mostram por que não se deve impor um p90 de 20 palavras à resposta inteira do Llama a partir de uma linha da VN. Também há diferença de idioma. Essas distribuições são referência descritiva; não certificam fidelidade, naturalidade ou adequação autobiográfica ao recorte D1. O CSV não fornece situação, cena ou época.

## Curadoria e exemplos

`npm run prepare:persona-v2-1` gera o banco e a auditoria a partir do catálogo rastreável já existente. Cada adaptação tem falante, trecho, linhas, contexto e hash conferidos contra o snapshot original. O dicionário de perguntas do KurisuQA não é usado como pareamento confiável: entradas genéricas misturam cenas e a análise encontrou respostas atribuídas a outros personagens no corpus existente.

O banco tem **19 exemplos**: 17 adaptações de atuação e duas demonstrações sintéticas de contrato de memória. O nível 1 fornece dez adaptações e as duas demonstrações, totalizando 12; o nível 2 fornece todos os 19. Alguns exemplos têm continuidade de mais de dois turnos. As demonstrações de memória distinguem recordação de fato e proposta nova baseada em gosto, com índices válidos e fatos fictícios próprios.

`curation-audit.json` liga cada adaptação à situação e registra estatísticas do trecho original e da adaptação. Essas amostras por situação são pequenas e selecionadas editorialmente; não são estimativas representativas da personagem. O estado `humanAccepted:false` permanece explícito. Cenas posteriores ao recorte D1 fornecem somente função de reação, sem virar autobiografia nem relação com o usuário.

Não houve sobreposição literal detectada dos exemplos com desenvolvimento, regressão, memória, iniciativa ou reservados. Isso não prova independência semântica. Não se deve reutilizar uma categoria ou cena observada como se fosse uma validação completamente nova.

## Braços isolados

Todos os braços usam o processador de turnos real, as mesmas fixtures, amostragem, contrato factual, formato de expressão e direção final comum. Exemplos não entram no histórico persistido nem na extração de memórias.

| Braço        | Mudança                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `current`    | Núcleo atual, com direção final comum à bateria.                                                                                |
| `card`       | Substitui somente o núcleo de atuação pela ficha experimental de 2.214 caracteres. Complementos operacionais permanecem iguais. |
| `card-shots` | Mesma ficha de `card`, acrescentando os exemplos como mensagens de chat antes do histórico real.                                |

Comparar primeiro `current` com `card`; depois `card` com `card-shots`. A ficha é uma hipótese completa de núcleo, não prova causal de uma frase específica. Quantidade de exemplos, mensagens finais, hashes, custos e decomposição da latência ficam no relatório. Não foram implementados nesta preparação os controladores de perguntas/movimentos, corte de stream, classificação paralela de expressão, novos estados de planos ou DPO.

Na pasta `code/backend/api`, estas execuções **somente planejam**:

```powershell
npm run eval:conversation-quality -- --suite=quality-v2.1 --split=development --variants=current,card --only=D01,D02 --budget=0.25
npm run eval:conversation-quality -- --suite=quality-v2.1 --split=development --variants=card,card-shots --shots=1 --budget=0.25
```

A v2.1 exige orçamento explícito e dez amostras por cenário. O padrão é desenvolvimento e Llama como único autor. Os valores acima são exemplos de planejamento, não uma nova autorização de gasto. Acrescentar `--run` inicia inferência e só deve ocorrer com orçamento autorizado. `--judge=gemini|qwen|kimi` altera o juiz, não o modelo que interpreta Amadeus.

## Juiz e comparação em pares

A rubrica v2.1 explicita reprovações de atendimento, ignorância de fatos, extrapolação de histórico e desvio do recorte. Uma resposta genérica curta não recebe fidelidade presumida; evidência insuficiente permite `pass:null`.

O comparador recebe pergunta, fatos e histórico correto de cada resposta. Julga nas ordens A/B e B/A. Discordância entre ordens, falha ou incapacidade de decidir ficam como desconhecidas. Empates permanecem registrados. A preferência relativa não declara a vencedora aceitável; a aceitação conjunta é um campo separado e continua dependente da calibração.

O intervalo usa bootstrap de cenários, mantendo turnos e amostras correlacionados dentro do cenário. Com poucos cenários, o resultado é exploratório; dez repetições de dois cenários não equivalem a vinte situações independentes. Não há aprovação automática baseada em vitória relativa ou intervalo.

Exemplo de planejamento, substituindo o nome pelo relatório concluído:

```powershell
npm run eval:persona-pairwise -- --report=TIMESTAMP-quality-v2.1.json --a=current --b=card --judge=gemini --budget=0.25
```

## Orçamento agregado

Autor, juiz absoluto e comparação nas duas ordens compartilham `data/refinement/quality-v2-1-budget.json` e o mesmo bloqueio exclusivo. O comparador não ganha outro teto. Reservas são persistidas antes da chamada; tentativas sem custo informado conservam a estimativa. O mesmo teto e manifesto são exigidos em comandos subsequentes; o executor não reinicia a rodada nem aumenta o valor automaticamente.

O registro v2 anterior, com US$ 0,20724567 contabilizados da segunda rodada, continua preservado. Nenhum registro financeiro v2.1 foi criado pelas execuções a seco. O máximo técnico aceito pelo executor não autoriza gastar esse valor. Ainda não há orçamento novo aprovado para inferências v2.1.

## Calibração humana e critérios

A ficha local `code/backend/api/data/refinement/1791418467896-quality-v2-calibration.md` continua com 30 turnos pendentes de avaliação humana. Não foram inventadas notas, nem alteradas as respostas ou os rótulos. A concordância com a rubrica nova exige julgamentos feitos com essa rubrica; as notas antigas não calibram automaticamente um juiz ou uma rubrica diferente.

O calibrador agora informa a taxa de falsas aprovações entre reprovações humanas. Se não houver reprovações humanas disponíveis, a taxa é desconhecida, não zero. Os alvos de concordância de 80% e falsas aprovações de até 10% aparecem por critério, com cobertura, sem certificar automaticamente o juiz.

Concisão, perguntas, repetição, idioma e marcadores de estilo continuam diagnósticos de avaliação. Não há filtros de palavras na produção, sorteio de proibição de perguntar ou corte obrigatório na segunda frase. Os próximos passos são revisar as fichas, definir o envelope financeiro da inferência e executar A e B separadamente. Só depois entram memória/iniciativa, latência, novos reservados, sessões longas e voz.

## Congelamento e verificação

`npm run freeze:persona-v2-1` congela recursos e implementações relevantes por hash. Regenerar perfil ou exemplos exige verificar a formatação e congelar novamente, antes de começar uma rodada paga. Uma rodada já iniciada rejeita outro manifesto. O manifesto v2 original permanece intacto. O leitor normaliza BOM e o envelope `value/Count` do arquivo de regressão sem regravá-lo.

Os testes cobrem autoria/contratos dos exemplos, ausência de sobreposição literal, preservação de fatos e histórico nos braços, decisões nas duas ordens, bootstrap por cenário e orçamento compartilhado. Os testes de CLI bloqueiam `fetch` e verificam que a execução a seco não tenta acessar rede. Isso valida o mecanismo local, não as respostas futuras do Llama nem latência em voz.

A suíte completa passou em 78 arquivos, com 564 testes, usando dois trabalhadores. A preparação não substitui os portões de calibração humana, validação reservada ou áudio.
