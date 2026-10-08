# Calibração com rótulos recebidos e rodada Llama v2.1

**Ressalva de proveniência (08/10/2026):** os rótulos abaixo foram recebidos pela conversa e registrados com `origin: user-chat-2026-10-08`. Isso não comprova autoria humana nem revisão pessoal independente. A afirmação original de que o proprietário avaliou pessoalmente foi categórica demais. Os números permanecem como concordância com os rótulos recebidos, sem certificar calibração humana. A nova avaliação A/B/C enviada posteriormente declara expressamente autoria de outro modelo e será registrada separadamente, sem converter suas notas em referência humana.

Em 08/10/2026, foram recebidas notas para as 30 fichas da segunda rodada, originalmente apresentadas sem identidade do autor, variante ou nota automática. A autoria humana e a revisão pessoal dessas notas não estão confirmadas. A autorização daquela rodada foi **US$ 0,25 no total**, incluindo rejulgamento, geração pelo Llama e comparação em pares. O registro v2 anterior permanece preservado.

## Referência recebida — autoria humana não confirmada

As notas foram registradas no arquivo local `1791418467896-quality-v2-calibration.json`; a importação conserva os identificadores, contexto e respostas originais. O arquivo local `1791418467896-human-review.json` conserva os motivos recebidos na conversa; seu nome histórico não comprova autoria humana. Esses arquivos ficam em `data/refinement`, fora do versionamento.

| Critério            | Aprova | Reprova | Incerto | Não aplicável |
| ------------------- | -----: | ------: | ------: | ------------: |
| Interlocução        |     14 |      16 |       0 |             0 |
| Proporcionalidade   |     19 |      11 |       0 |             0 |
| Sustentação factual |     28 |       0 |       2 |             0 |
| Continuidade        |     29 |       1 |       0 |             0 |
| Persona             |      2 |      24 |       4 |             0 |
| Perguntas           |     15 |      15 |       0 |             0 |
| Recomendações       |      0 |       0 |       0 |            30 |
| Cânone              |      0 |       0 |       0 |            30 |

Os quatro casos incertos de persona e dois de sustentação factual não viraram aprovações nem reprovações. A amostra cobre dois cenários de desenvolvimento; não valida todos os critérios nem generalização para conversas reservadas. Em especial, não há reprovação factual nos rótulos recebidos para estimar falsas aprovações nesse critério, e há apenas uma reprovação de continuidade.

## Juiz anterior

Comparar com os vereditos originais não exige novas chamadas. O juiz anterior concordou em 14/30 casos de interlocução, 19/30 de proporcionalidade, 2/26 de persona e 7/22 comparações disponíveis de perguntas. Aprovou todos os casos reprovados nos rótulos recebidos nesses critérios. Portanto, suas taxas elevadas de aprovação não servem como evidência de naturalidade ou fidelidade.

## Rejulgamento controlado

`npm run calibrate:persona-v2-1 -- --report=1791418467896-quality-v2.json --judge=qwen --budget=0.25` somente prepara. `--run` executa usando o mesmo controle financeiro de autor e juízes da v2.1. O juiz recebe expectativa, fatos, histórico e resposta, mas não recebe as notas humanas. Cada rejulgamento grava outro relatório, sem substituir os vereditos originais.

O relatório conserva respostas brutas, falhas de formato, abstenções, hashes e custo. A concordância exclui casos indefinidos, enquanto a cobertura explicita quantos ficaram de fora. A meta de 80% de concordância e até 10% de falsas aprovações não certifica um juiz sem cobertura suficiente. Justificativas que confundam o histórico com a resposta atual também precisam de inspeção humana.

## Candidatos do patch

O arquivo `patch-candidates.json` conserva o SHA-256 do patch recebido, 32 pares sintéticos e 12 direções por situação. Quinze pares exigem adaptação antes de experimento; os outros 17 permanecem candidatos, sem aprovação humana nem elegibilidade para produção. As referências aos presets foram preservadas, mas o arquivo original citado pelo patch não foi localizado no projeto versionado.

As direções foram reformuladas como hipóteses contextuais: uma saudação pode conter outro assunto, uma correção acompanha evidência e uma sugestão nova pode usar gostos sem já estar na memória. Não há classificação por palavras-chave. Os 25 presets sinalizados pelo patch são hipóteses de triagem, não condenações automáticas nem filtros de runtime.

Nesta rodada, os braços A/B continuam usando o banco rastreável existente. Misturar as direções e os novos exemplos com a troca de núcleo impediria atribuir o resultado à alteração testada. Esses candidatos ficam disponíveis para um braço posterior separado. Os exemplos externos com `memory: []` em todas as respostas não foram incorporados.

Produção, STT, TTS e configuração de memória não são alterados por essa preparação. Nenhum gasto de Cartesia é necessário.

## Resultado da calibração v2.1

Foram executados 30 rejulgamentos com Qwen e outros 30 com Kimi, consumindo **US$ 0,0521981675** somados. O Qwen produziu 17 vereditos válidos no contrato original, e o Kimi produziu 28. Uma auditoria offline recuperou nove e dois vereditos, respectivamente, cujo único problema recuperável era evidência vazia em critérios explicitamente não aplicáveis. A auditoria substitui somente essa representação por uma descrição de não aplicabilidade; não altera `applicable`, `pass`, resumo nem decisões. Os relatórios brutos continuam preservados. Quatro resultados do Qwen permanecem inválidos.

| Critério          | Juiz anterior | Qwen v2.1, após auditoria | Kimi v2.1, após auditoria |
| ----------------- | ------------: | ------------------------: | ------------------------: |
| Interlocução      |         14/30 |                     14/26 |                     22/30 |
| Proporcionalidade |         19/30 |                     16/26 |                     20/30 |
| Persona           |          2/26 |                     11/22 |                     11/17 |
| Perguntas         |          7/22 |                      4/23 |                     16/23 |

Os denominadores são comparações com rótulo recebido e decisão automática definida; não representam cobertura igual nem uma referência humana confirmada. No Kimi, a aprovação contrária ao rótulo recebido foi 5/16 em interlocução, 10/11 em proporcionalidade, 6/15 em persona e 2/15 em perguntas. A abstinência ou não aplicabilidade do juiz não conta como acerto. **Nenhum juiz atende aos portões de calibração.**

Uma divergência recorrente é o juiz considerar agradecimentos genéricos como evidência de persona, enquanto os rótulos recebidos exigem atuação distinguível. Também há justificativas que avaliam a resposta anterior ou a falta de histórico em vez do alvo atual. Antes de uma avaliação confirmatória, a rubrica precisa explicitar o alvo e os limites entre adequação educada e fidelidade, com exemplos de calibração e validação em fichas distintas. Escolher Kimi nesta rodada é uma escolha diagnóstica, não aprovação do juiz.

## Ensaio exploratório do autor

A rodada de atuação começa com `D02` (elogio, aceitação do elogio e discordância sem explicação): dez amostras por braço, três turnos por conversa, braços `current`, `card` e `card-shots`. Isso planeja 30 conversas e 90 turnos. A e B permanecem separados na análise: `current` versus `card` troca somente o núcleo; `card` versus `card-shots` acrescenta somente os 12 exemplos do nível 1. Os demais contratos, amostragem e diretiva final são comuns.

O cenário já foi observado e é de desenvolvimento. Uma única situação com repetições não comprova generalização; não houve consumo de cenários reservados. O Kimi fornece notas provisórias, enquanto concisão, perguntas, formato e decomposição da latência são medidos separadamente. O resultado não aprova naturalidade, fidelidade, memória, iniciativa ou voz automaticamente.

Os 90 turnos e as 30 conversas terminaram sem falhas de processamento. O relatório local é `1791430502341-quality-v2.1.json`, com transcrição e 30 fichas cegas em arquivos correspondentes. O gasto de geração e juiz absoluto foi US$ 0,154913935; com a calibração, o acumulado nesse ponto foi US$ 0,2071121025.

| Medida, 30 turnos por braço         |  Núcleo atual |         Ficha | Ficha + 12 exemplos |
| ----------------------------------- | ------------: | ------------: | ------------------: |
| Palavras p50 / p95                  |       36 / 61 |     40,5 / 66 |              9 / 20 |
| Interrogações por turno             |          0,73 |          0,67 |                   0 |
| Expressão válida na fala final      |         10/30 |         21/30 |               29/30 |
| Primeiro texto bruto p50            |        1,04 s |        1,01 s |              1,04 s |
| Primeiro texto utilizável p50 / p95 | 2,91 / 8,17 s | 3,21 / 6,92 s |      3,54 / 10,47 s |
| Recuperações de formato             |             3 |             0 |                   1 |

A ficha sozinha não melhorou a concisão nessa situação. Acrescentar exemplos reduziu a mediana de palavras em 77,8% frente à mesma ficha e melhorou a expressão, mas não reduziu o primeiro texto utilizável. Houve uma geração via Novita no braço com exemplos; as demais gerações foram via DeepInfra. A comparação de latência mede prompt, rota e processador, sem STT/TTS; não fixa um único endpoint nem comprova efeito causal de infraestrutura. As diferenças de p50 entre etapas não devem ser somadas como se pertencessem à mesma resposta.

O tempo do cabeçalho, quando presente, foi relevante: p50 de aproximadamente 1,24 s no braço com exemplos entre primeiro conteúdo bruto e primeira fala após `</expression>`. Esse subconjunto tem cobertura diferente dos braços com metadados inválidos. O agrupamento também acrescentou espera. Isso sustenta medir separadamente um futuro braço de fala sem cabeçalho, não instalar essa mudança agora nem prometer uma latência final.

Concisão não certifica atuação. Por exemplo, o braço com exemplos gerou “Obrigada. É gentileza sua.” e “Obrigada. Fico feliz que tenha feito sentido para você.”, ainda próximas das fórmulas que a referência recebida reprovou. Na discordância também apareceram falas brandas pedindo implicitamente a razão, em vez de uma posição marcante. O relatório conserva os exemplos completos para revisão cega.

Uma auditoria offline contra os exemplos realmente inseridos encontrou zero respostas integralmente iguais e zero cópias de trechos com oito palavras nos três braços. Isso não exclui imitação de ritmo, fórmulas curtas nem convergência semântica. Os exemplos e o núcleo experimental permanecem fora da produção.

Para a comparação relativa, foi fixado um subconjunto com as primeiras quatro repetições completas, todos os braços e turnos, sem seleção por qualidade. O relatório derivado `1791431866135-quality-v2.1.json` registra o hash do original. Comparar `card` versus `card-shots` produz 12 pares e 24 julgamentos A/B e B/A, compartilhando o teto financeiro restante. A avaliação em pares também permanece exploratória e não valida o juiz nem a persona.

Essa comparação terminou no relatório local `1791431889338-quality-v2.1-pairwise.json`, custando US$ 0,0229405. Dois pares favoreceram os exemplos nas duas ordens; seis tiveram pelo menos um veredito inválido e quatro tiveram decisão indefinida ou sensível à ordem. Portanto, dez dos doze pares ficaram desconhecidos. A preferência relativa de 100% exibida pelo resumo refere-se apenas aos dois pares resolvidos e não deve ser apresentada como taxa de aprovação. Há um único cenário e nenhum intervalo inferencial útil.

Uma limitação adicional do comparador é conservar os vereditos válidos e erros de parsing, mas não o texto bruto dos vereditos inválidos. As chamadas concluídas ainda foram cobradas. O próximo ajuste da infraestrutura deve preservar esse texto para permitir auditoria de representação sem novas inferências, como já acontece no rejulgamento absoluto. Não houve recuperação inventada desses seis pares nem novas chamadas para substituí-los.

## Encerramento e próximos passos

O gasto agregado foi **US$ 0,2300526025 de US$ 0,25**, com **US$ 0,0199473975 restantes**, nenhum custo sem informação e nenhuma reserva pendente. Não houve aumento nem reinício do teto entre calibração, autor e comparação em pares. As 30 fichas anteriores com rótulos recebidos continuam registradas, e o ensaio novo gerou outras 30 fichas cegas ainda sem avaliação humana.

O ganho demonstrado nesta situação é concisão e conformidade do formato com exemplos. A ficha sozinha não demonstrou benefício, o juiz não está calibrado, a fidelidade não está aprovada e a latência não atingiu a meta. Os candidatos do patch ficam disponíveis para revisão, sem misturar suas direções com o tratamento testado. Produção, memória pessoal e voz permanecem preservadas.

Antes de avaliação confirmatória, a prioridade é definir evidência distinguível de persona, separar a resposta-alvo do histórico no juiz, exigir justificativa ancorada no alvo e conservar respostas brutas em todos os modos. A calibração ajustada precisa de fichas independentes e situações além de elogios. Depois entram saudações, apelidos, discordância, desabafo, memória e iniciativa em braços próprios; só então novos reservados, sessões longas e voz. Um braço de fala sem cabeçalho deve ser medido separadamente para investigar latência, sem promover mudança automática de produção com base nesta amostra.

Verificação local: typecheck, lint do novo calibrador, formatação e 14 testes pertinentes passaram. A checagem de diff não encontrou problemas de whitespace. Esses checks verificam a infraestrutura, não aprovam a atuação do Llama.
