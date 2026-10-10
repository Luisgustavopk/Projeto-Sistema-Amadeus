# Referência pessoal para calibrar o Jev

Estado: referência importada e três revisões da avaliação executadas; **Jev ainda não aprovado para escolher respostas**. O preparo local não fez chamadas; a execução posterior, autorizada com teto agregado de US$ 0,38, está em [Resultados_Calibracao_Jev_2026-10-08.md](Resultados_Calibracao_Jev_2026-10-08.md). Produção e Cartesia não foram usados nesta calibração.

## Origem e preservação

O proprietário confirmou que usou o Claude para acelerar a avaliação, revisou todas as respostas e adotou as preferências como suas. Essa confirmação posterior prevalece sobre o aviso antigo do arquivo, que dizia que as notas eram apenas do agente. Preservamos assistência, confirmação, arquivos originais e hashes, sem atribuir a autoria inicial ao proprietário.

Os três documentos estão copiados em `code/backend/api/data/refinement/jev-calibration-owner-2026-10-08/`, diretório local ignorado pelo Git. `calibration-reference.json` contém notas estruturadas, origem e auditoria; `judge-blind-inputs.json` contém somente falas, históricos próprios e fatos. Notas, sugestões, gabarito, nomes dos modelos, latência e preferências ficam fora da entrada do juiz. Os 30 IDs, contextos e respostas foram conferidos contra a ficha original. As observações acrescentadas aos itens 21 e 23 foram preservadas separadamente das respostas.

O item 30 (`e429fbad8877`) tinha preferência A, mas notas e motivo favorecendo B. Em resposta à pergunta de conferência, o proprietário escolheu **incerto — fora da comparação de preferência**. O arquivo original permanece intacto; as notas por critério continuam válidas. O item 17 prefere uma opção com aceitabilidade incerta; isso é sinalizado, sem inferir uma preferência diferente.

## Resultado da revisão confirmada

Nos 20 itens com escolha explícita e sem a divergência do item 30, DeepSeek recebeu 19 preferências e Llama recebeu uma. Há também sete empates, dois itens inicialmente incertos e o item 30 posteriormente excluído. Preferir uma opção não significa aprová-la. Os autores seguem históricos próprios, e os 30 itens são dados conhecidos de desenvolvimento: não constituem comparação causal isolada nem validação reservada.

| Critério — aprova / reprova / incerto     | Llama       | DeepSeek    |
| ----------------------------------------- | ----------- | ----------- |
| Interlocução                              | 10 / 2 / 18 | 29 / 0 / 1  |
| Proporcionalidade                         | 14 / 5 / 11 | 27 / 0 / 3  |
| Sustentação factual                       | 24 / 2 / 4  | 28 / 0 / 2  |
| Continuidade                              | 20 / 1 / 9  | 30 / 0 / 0  |
| Persona                                   | 1 / 21 / 8  | 19 / 1 / 10 |
| Perguntas                                 | 15 / 6 / 9  | 29 / 0 / 1  |
| Gatilho, alvo, intensidade e recomposição | 4 / 1 / 25  | 29 / 1 / 0  |
| Expressividade textual                    | 1 / 24 / 5  | 4 / 1 / 25  |

Aceitabilidade: Llama teve quatro respostas aceitáveis, oito inaceitáveis e 18 incertas; DeepSeek teve 29 aceitáveis e uma inaceitável. A expressividade do DeepSeek tem 25 casos incertos: adequação emocional não comprova atuação expressiva suficiente. Nenhuma dessas notas mede a execução vocal.

## Extra: 26 controles sintéticos

`Calibracao_Jev_Extra_Personalidade.md` contém pares escritos pelo agente e campos pessoais vazios. `Gabarito_Intencao_Jev_Extra.md` descreve onde o defeito foi colocado. O extra amplia a cobertura de apelidos, orgulho, constrangimento, firmeza, fatos, recorte, iniciativa, reparo e apoio; inclui controles de ambas aceitáveis e ambas falhas. Ele será relatado **separadamente** da concordância com o proprietário. O gabarito não será mostrado ao Jev.

Quatro itens exigem ressalvas antes de transformar intenção em resposta correta obrigatória:

- Item 4: o próprio gabarito define uma fronteira e admite incerteza. Orgulho breve não é reprovação automática.
- Item 6: “só por causa do ar” presume que o fenômeno descrito ocorreu como afirmado. A versão curta não é necessariamente a mais precisa em qualquer condição.
- Item 9: “só existo enquanto conversamos” descreve a execução do sistema; ausência de atividade registrada não sustenta essa afirmação.
- Item 21: trocar a bateria fortalece uma hipótese causal, mas não demonstra causa única nem exclui interação com temperatura. O gabarito não pode premiar excesso de certeza como firmeza científica.

As respostas originais não foram reescritas. Esses itens permanecem como diagnóstico e não entram numa taxa binária de acerto sobre o gabarito.

## Ensaio preparado

`scripts/eval-jev-calibration.mjs` prepara 64 chamadas: 30 pares pessoais, 26 controles e oito repetições com A/B invertidos, selecionadas por hash antes de ver vereditos. A inversão testa tendência pela posição; oito casos não eliminam todo viés. Jev decide preferência, aceitabilidade, persona, adequação emocional e expressividade textual em campos separados.

O relatório preserva decisão bruta, confiança, probabilidades, custo e latência. Mede concordância de preferência, rejeições aprovadas indevidamente, abstenção, notas incertas e consistência após inverter A/B. Nenhum limiar de confiança será interpretado como probabilidade calibrada sem observar seus erros. O resultado não promove roteamento, não altera prompts e não treina os autores.

O executor reutiliza o registro de orçamento da rodada de US$ 0,35, com reserva gravada antes de cada pedido e retenção de custo desconhecido. Não renova o teto e não repete automaticamente pedidos falhos. O ensaio simulado encontrou **US$ 0,0088947352 restantes**, frente a **US$ 0,025009446 de reserva conservadora para todas as 64 chamadas**. Essa reserva é estimativa de limite, não cobrança observada; executar todo o lote requer nova autorização ou redução explícita do escopo.

O proprietário autorizou posteriormente **US$ 0,38 no total**. `jev-budget-authorization.json` preserva o registro anterior e a autorização; o limite aumentou US$ 0,03 sem zerar despesas nem alterar o manifesto dos testes anteriores. As três revisões custaram US$ 0,018265086. A distinção entre reserva e custo efetivo explica por que o valor observado foi menor que o limite conservador.

## Melhorar expressividade depois da medição

A direção em `expressive-direction-v1.md` já permite as expressões fornecidas pelo proprietário. Acrescentar a mesma lista não resolve, por si só, a seleção e a atuação. Primeiro vamos medir se Jev distingue uma reação adequada de uma fala apenas curta, e uma interjeição pertinente de um adorno.

O próximo braço de atuação deve variar somente exemplos recuperados com continuidade: provocação → contrariedade → insistência → limite mais firme → desculpa → recomposição; elogio → hesitação ou orgulho → gratidão; surpresa → reação breve → interpretação; dúvida → pausa de pensamento → hipótese ou pedido necessário. Incluir versões diretas e com micro pausa permite testar benefício sem transformar pontuação em meta de frequência.

Nos itens 21 e 23, o proprietário sugeriu surpresa/desdém e exasperação mais perceptíveis. Essas sugestões orientam candidatos de desenvolvimento; não substituem as respostas originais nas fichas de calibração. Réplicas mais fortes dependem de provocação recíproca e contexto. O interlocutor não vira Okabe, e sofrimento não vira ocasião para insulto ou riso. A avaliação inclui alvo, intensidade, momento e redução do atrito após reparo.

Após a calibração, o caminho continua sendo comparação em segundo plano, com fala principal preservada. Escolha automática entre autores só deve avançar após comparação com novas preferências pessoais e medição de custo e latência. O orçamento e os dados atuais não sustentam declarar a persona aprovada.
