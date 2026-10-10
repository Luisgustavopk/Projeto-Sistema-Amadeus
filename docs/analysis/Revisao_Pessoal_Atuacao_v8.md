# Revisão pessoal da atuação e das expressões — v8

## Origem e verificação

Em 9 de outubro de 2026, o usuário confirmou as duas fichas recebidas: “eu revisei oq foi gerado e achei valido”. Os preenchimentos assistidos pelo Claude passam a ser referência revisada e confirmada pelo responsável pelo projeto. A autoria das respostas havia sido inferida durante a avaliação; portanto, esta referência **não é uma avaliação cega independente**. Os avisos anteriores nos arquivos recebidos permanecem preservados, mas não descrevem a confirmação posterior.

A importação local verificou os 25 pares e as 252 propostas de expressão contra os artefatos originais: IDs, ordem, letras, pergunta atual, resposta e histórico dos pares, além de igualdade exata dos objetos JSON de expressão. A única normalização textual permitida foi de espaços e quebras de linha. Os arquivos recebidos não foram modificados. Os rótulos `parcial` foram preservados como avaliação de grau, separados de `incerto`.

As referências individuais, hashes das fontes e resultados verificáveis ficam no diretório local ignorado pelo Git:

- [Referência confirmada e rastreabilidade](../../code/backend/api/data/refinement/latency-v8-remainder/owner-reviewed-reference.json).
- [Contagens e comparação com o Jev](../../code/backend/api/data/refinement/latency-v8-remainder/owner-review-summary.json).
- [Importador local com verificações de correspondência](../../code/backend/api/data/refinement/latency-v8-remainder/import-owner-review.mjs).

Esta análise não fez chamadas remotas nem alterou o runtime. Complementa os [resultados originais da v8](Resultados_Atuacao_Latencia_v8.md); não reescreve os vereditos históricos do Jev.

## Preferência e atuação

A correspondência privada confirma a contagem: **DeepSeek preferido em 23/25 itens; Llama em 2/25**, nos itens 22 e 23. As contagens das fichas também coincidem com o resumo recebido.

| Critério | DeepSeek: sim / parcial / não | Llama: sim / parcial / não |
| --- | --- | --- |
| Adequação | 23 / 2 / 0 | 1 / 16 / 8 |
| Persona | 23 / 1 / 1 | 1 / 23 / 1 |
| Expressividade | 24 / 1 / 0 | 16 / 9 / 0 |

Neste recorte, o DeepSeek mantém melhor a firmeza, a reação reservada ao elogio e o fechamento curto. O Llama frequentemente recorre a perguntas e ofertas de disponibilidade, além de presumir acontecimentos ausentes do histórico. A preferência é contextual e não equivale a aprovação geral do modelo, do fluxo de voz ou de todas as afirmações da resposta.

Há uma ressalva editorial adicional, mantida **separada das notas pessoais**: na conversa N05 sobre a lâmpada, o DeepSeek pressupõe “circuitos diferentes”, embora a pessoa só tenha mencionado outra luz piscando. Também trata a persistência após fechar o navegador como eliminação definitiva de uma hipótese e uma observação na rua como teste decisivo. As informações dadas não sustentam essas conclusões com esse grau de certeza. Ser mais convincente e propor um teste não comprova rigor causal. A rodada seguinte deve testar atualização de hipóteses sem transformar pistas em certezas.

Os itens 22 e 23 mostram outro limite: consolar atribuindo pensamentos à turma ou à professora ultrapassa o registro disponível. Preservar calor e reconhecer vergonha não exige afirmar o que terceiros pensaram.

## Jev contra a referência confirmada

O Jev concorda em **23/25 preferências (92%)**. Seus dois desacordos favorecem o Llama onde a referência prefere o DeepSeek:

| Item | ID | Momento | Diferença observada na referência |
| --- | --- | --- | --- |
| 7 | `00658235c548` | Elogio ao jeito da persona | Reação breve ao elogio pessoal, em vez de explicá-lo como atendimento |
| 24 | `4636bec448b2` | Desculpa aceita pela professora | Reconhecer o desfecho, em vez de elogiar genericamente a professora e devolver uma pergunta |

O Jev acertou os dois itens em que a preferência foi pelo Llama, mas também escolheu o Llama nos dois desacordos. **Escolher sempre o DeepSeek teria igualmente 23/25 acertos** neste conjunto desequilibrado. A concordância agregada, portanto, não demonstra benefício de seleção. Os 25 turnos pertencem a seis conversas encadeadas, não a 25 observações independentes.

Para comparar critérios, `parcial` não foi convertido em aprovação, reprovação ou incerteza. A tabela abaixo usa somente notas pessoais definitivas `sim`/`não`:

| Critério | Concordância em notas definitivas | Reprovações pessoais aprovadas pelo Jev | Notas parciais, fora dessa taxa |
| --- | --- | --- | --- |
| Adequação | 26/32 (81,25%) | 5/8 | 18 |
| Persona | 19/26 (73,08%) | 0/2 | 24 |
| Expressividade | 30/40 (75%) | Não estimável: nenhuma nota `não` | 10 |

O Jev aprovou 12/18 casos de adequação parcial, 5/24 de persona parcial e 5/10 de expressividade parcial. Esses números descrevem como ele trata casos intermediários, sem pressupor que uma nota parcial tenha um equivalente binário correto. Não houve decisão `incerto` nesses critérios dos 25 pares.

Há poucos exemplos de vitória do Llama, nenhuma preferência por empate ou ambas inadequadas, e nenhuma reprovação explícita de expressividade. Esta ficha é útil para diagnóstico, mas insuficiente para validar abstenção, detectar falsas aprovações expressivas ou ativar seleção automática. **Jev permanece fora da seleção em produção.**

## Expressões e intensidade

| Dimensão | Sim | Não | Incerto | Não aplicável |
| --- | ---: | ---: | ---: | ---: |
| Intenção | 136 | 4 | 61 | 51 |
| Emoção | 142 | 4 | 55 | 51 |
| Intensidade | 135 | 1 | 65 | 51 |

As contagens recebidas foram confirmadas. As 51 propostas inválidas são 20,24% das 252 respostas, mas sua causa observada é a **ausência da abertura `<expression>` nas 51 saídas**, e não a rejeição de um rótulo pelo enum. São 11 falhas no braço baseline e 40 no isolated. A classificação paralela produziu **84/84 propostas válidas**, sem erros do observador. A ampliação do contrato já aceita os rótulos atuais; ampliá-lo novamente não resolveria a ausência do cabeçalho.

Por isso, não é indicada uma repetição da geração completa antes do fallback como correção principal. O caminho que separa fala e expressão já removeu essa dependência no experimento. Uma eventual recuperação limitada do observador deve permanecer fora da entrega da fala e só se justificar se surgir falha real nesse observador.

Há **65/201 intensidades válidas iguais a 0,5**. Dessas, **61 estão nas 84 classificações paralelas**: 27 no Llama e 34 no DeepSeek. A concentração ocorre sobretudo no observador, não de maneira uniforme nos três braços. Ela merece investigação, mas, isoladamente, não prova erro: 65 avaliações de intensidade ficaram incertas, e a ficha não estabelece uma intensidade ideal numérica por caso.

Trocar o contrato por três categorias pode apenas trocar `0,5` por “média” e perder a flexibilidade solicitada. A recomendação é manter 0–1 e acrescentar âncoras de intensidade da **reação da persona**, distinguindo limite calmo, incômodo perceptível, insistência e recomposição. Avaliar o valor e a evolução por contexto, sem obrigar bordões, raiva ou variação numérica a cada turno.

A ausência de irritação não é total: houve **seis `irritacao_leve`**, todas nos braços com cabeçalho. No paralelo não houve `irritacao_leve`, `irritacao` ou `raiva`. É um indício de perda de discriminação nesse observador; ainda assim, um limite pode legitimamente ser firme e calmo. A ausência do rótulo não demonstra, por si só, ausência da reação no texto.

**Nenhuma das 252 avaliações julgou a mudança em relação ao turno anterior.** Logo, esta ficha não valida escalada após insistência nem redução após desculpa. Além disso, o observador recebe o primeiro segmento utilizável, enquanto a ficha apresenta a resposta completa. A avaliação seguinte deve mostrar explicitamente esse trecho observado, para distinguir erro de classificação de informação que ainda não estava disponível.

## Latência e próximos ajustes

As medianas de primeiro segmento utilizável continuam acima da meta de 1,5 s: Llama **2,13 s**, DeepSeek **1,71 s**, sem STT/TTS. A expressão paralela chega, em mediana, **1,77 s e 1,59 s depois desse segmento**, respectivamente. O observador começa nesse primeiro segmento e não é aguardado para entregá-lo; os tempos tardios não são atraso de fala causado por uma espera pelo observador. Tampouco garantem expressão adequada no início do áudio. A classificação posterior não pode mudar áudio que já foi reproduzido.

O próximo ciclo deve separar duas linhas de trabalho, conservando os modelos e medindo mudanças isoladas:

1. **Atuação e classificação:** recuperar exemplos pela função e continuidade, testar limite → insistência → reparo, elogio reservado e consolo sem certeza inventada. Fornecer ao observador contexto suficiente e âncoras proporcionais, avaliando texto, metadados e transições separadamente. Não inserir expressões obrigatórias.
2. **Entrega da fala:** comparar o temporizador atual de 700 ms com segmentação mais rápida, medindo primeiro segmento completo e utilizável, cortes, concisão e cancelamento. Não esperar Jev ou observador para começar a fala. A integração com memória deve preservar a verificação factual; o candidato atual ainda recusa fatos persistentes.
3. **Jev:** usar os desacordos como desenvolvimento e validar depois em novos pares com empates, ambas inadequadas, expressividade deslocada e mais vitórias plausíveis de ambos os autores. Não retestar os mesmos itens como evidência independente após ajustar a rubrica.

O caminho sem cabeçalho continua candidato; esta revisão não o implantou no Voice Test. A voz permanece para validação final do usuário. Nenhum novo gasto foi realizado: o agregado conservador segue **US$ 0,2145301172 de US$ 0,27**, com saldo de **US$ 0,0554698828**.
