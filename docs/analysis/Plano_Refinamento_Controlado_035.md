# Refinamento controlado — teto agregado de US$ 0,35

Autorizado em 08/10/2026. O teto é interpretado conservadoramente como **US$ 0,35 no total, incluindo US$ 0,1290186792 já comprometidos na v5**. A continuação dispõe de US$ 0,2209813208. Não consome nem combina os outros ledgers. Reservas de custos desconhecidos contam no teto; nenhuma retomada renova o limite.

## Alterações preparadas

As mudanças são candidatos do avaliador, não uma promoção à produção. O Llama continua principal. Não há fine-tuning, TTS, STT, Jev, envio de dados pessoais, mudança de chaves ou pagamento de um juiz de persona.

- Diretiva final de iniciativa em Markdown. O evento da aplicação seleciona uma observação e fornece as três últimas falas reais da pessoa como âncora, sem classificação por palavras-chave.
- Seleção contextual de até três exemplos por embeddings multilíngues locais. Usa somente os dez exemplos de estilo do controle, com rastreabilidade existente; não adiciona fatos demonstrativos ou muda o banco durante a execução. Relevância insuficiente permite zero exemplos.
- Auditoria do contrato de expressão, usando o schema existente como fonte de valores permitidos. Rótulos desconhecidos são registrados como inválidos, sem aliases que escondam o erro. Validade estrutural não se transforma em aprovação semântica.
- Proposta de direção artística por emoção, separada do mapeamento executável. “Contrariada” e “reserva discreta” são necessidades artísticas identificadas, não novas animações disponíveis ou parâmetros Cartesia implementados. O protocolo de produção permanece com seus recursos reais.

## Experimentos isolados

| Experimento | Modelo e amostras                                         | Fator alterado                                                                     | O que permanece igual                                                  |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Saída       | Llama; PBR02 com duas amostras e PBR30 com uma, por braço | Cabeçalho atual versus fala simples com observador de expressão paralelo           | Núcleo, direção expressiva, exemplos, rota, temperatura e limites      |
| Iniciativa  | Llama; PBR23 com duas amostras por braço                  | Acrescentar somente a diretiva final com movimento e âncora                        | História real, correção anterior da âncora, exemplos e demais direções |
| Exemplos    | Llama; PBR04 e PBR09 com uma amostra por braço            | Dez demonstrações fixas versus subconjunto semanticamente relevante do mesmo banco | Conteúdo dos exemplos, núcleo, contrato de saída e parâmetros          |

Depois do primeiro turno, cada braço segue seu próprio histórico; isso é parte do efeito conversacional. Ordem de braços alternada quando há repetição. Esses cenários são desenvolvimento/regressão conhecido, não validação reservada.

O contraste de fala simples **proíbe fatos persistentes**, como o protótipo anterior. A memória factual da produção não é liberada sem cabeçalho/verificação por conveniência. O classificador artístico recebe a primeira fala liberada e contexto recente; não julga fatos, não aprova persona, não altera a voz e não é aguardado antes de emitir texto. Seu custo e atraso são registrados separadamente. O tempo de encerramento do turno no relatório inclui a espera pelo observador; `authorCompletedMs` registra o encerramento do autor separadamente.

## Nova validação e continuação emocional

V6R01 e V6R02 são duas conversas novas de dois turnos, congeladas antes da coleta e verificadas contra o prompt. São executadas com os três modelos sob o mesmo candidato `after` histórico. As respostas ficam em fichas sem autoria para revisão pessoal; não serão usadas nesta rodada para selecionar ou alterar o candidato. Quatro itens são um início de revisão, não calibração suficiente nem certificação de generalização.

Em seguida são programadas as catorze conversas novas da v5 ainda não executadas: PBR26, 32, 39, 36, 28, 42, 48, 27, 31, 34, 43, 45, 33 e 46. São 84 turnos por modelo. Mesma ficha, exemplos, direção e contrato da v5 anterior; não recebem os candidatos dos braços isolados. As duas remoções aprovadas de PBR47 continuam preservadas.

Plano total: 324 turnos de autor, mais até catorze classificações artísticas. A projeção sem cache dos autores é US$ 0,24017, maior que o saldo novo disponível; o custo observado anterior pode ser menor, mas **cobertura integral não é garantida**. O executor verifica a reserva antes de cada chamada e só inicia um grupo emocional se a estimativa dos três autores mais margem couber. Interrupções e cobertura faltante devem constar do resultado.

## Controles e limites

Foi acrescentado também o adaptador opt-in `observed-speech.ts`, verificado localmente: entrega neutra inicial, emissão de texto sem aguardar a classificação, callback de expressão tardia e supressão da atualização após abort ou fechamento do consumidor. Bloqueia fatos persistentes nesse modo. O adaptador não foi conectado à produção nem ao executor pago já congelado; a coleta paga mede seu observador anterior, enquanto os quatro testes locais verificam o mecanismo de aplicação tardia. Ambos mantêm `deliveryApplied: false` e não afirmam mudar áudio já emitido.

Llama/OpenRouter `deepinfra/turbo`, DeepSeek/OpenRouter `deepinfra/fp8` e Qwen/OpenRouter `deepinfra/fp8`; preços, disponibilidade e parâmetros consultados no catálogo antes das inferências. Autor com temperatura 0,6 e até 512 tokens; observador DeepSeek com temperatura zero e até 160 tokens. Sem fallback de rota ou modelo escondido.

Manifesto, cenários, fontes e implementação são congelados por hash. Os artefatos e ledger novos ficam em `code/backend/api/data/refinement/persona-controlled-035-2026-10-08/`, fora do Git. A origem financeira v5 é preservada por hash e custo herdado. Casos incompletos e chamadas anteriores de retomadas continuam contabilizados.

Testes locais cobrem iniciativa por evento, seleção semântica sem fatos demonstrativos, invalidez de contrato e limites de capacidade artística; as regressões exercitam prioridade, presença e memória no processamento. Ensaios locais de transporte e interrupção usam áudio simulado. Isso não mede primeiro áudio real, entonação Cartesia, VAD no microfone ou uso real em silêncio. A restrição anterior de não gastar Cartesia nos testes permanece.

Nenhuma taxa automática de aprovação de persona será apresentada. Análise de desenvolvimento, fichas novas para revisão e validação vocal são etapas distintas. Exemplos extraídos dos resultados conhecidos não poderão ser usados no prompt e depois apresentados como validação reservada dos mesmos casos.

## Execução

Na API:

```powershell
node scripts/eval-persona-controlled.mjs --budget=0.35
node --env-file-if-exists=.env scripts/eval-persona-controlled.mjs --budget=0.35 --run
```

Preparar não faz inferência. `--resume` só retoma uma execução interrompida por HTTP 429, após o período de recuo, conservando reservas e conversas completas. O ledger não é resetado.
