# Atuação e voz expressiva — 09/10/2026

## Diagnóstico e mudanças

As transcrições reais mostram irritação formal, repetição da identidade, vocativo composto e atividade inventada nos dois autores. Isso não fica explicado pelas cotas nem pelos tetos do `.env`. Os ensaios e a chamada também usavam núcleos de atuação diferentes. O modo paralelo classificava a fala depois de liberá-la, sem encaminhar emoção à síntese.

- **Atuação refinada:** a chamada pode carregar diretamente `quality-v2.1/core-card.md`, `quality-v3/presence-positive.md`, a skill concisa, a direção expressiva vigente e a diretiva final de turno. O núcleo anterior continua selecionável para comparação. Os relatórios históricos e seus conjuntos congelados não foram alterados. Recuperação de exemplos e história, estado artístico e verificações de memória permanecem ativos. Isso alinha os recursos do núcleo; não significa que toda variante experimental de exemplos tenha sido promovida.
- **Rastreabilidade:** `GET /v1/voice/runtime/acting`, autenticado, informa modo, versão, caracteres e hashes dos recursos carregados, sem conteúdo pessoal. Inicialização e recuperação da geração usam o mesmo núcleo e vocativo.
- **Vocativo:** `preferredAddressName` fica na configuração SQLite por proprietário, separado do nome civil nos fatos. Edição de estilo sem esse campo preserva a preferência; `null` a remove. A interface permite defini-lo antes da chamada. O revisor de fatos recebe essa preferência somente em conversas pessoais, como tratamento confirmado, sem inventar uma fala no histórico. Ela é excluída dos testes sintéticos.
- **Voz expressiva:** o próprio autor gera a expressão antes da fala. Intenção, emoção e intensidade são validadas pelo contrato existente e a emoção é encaminhada ao Cartesia por `generation_config`. Não há classificador adicional nem transformação de intensidade em volume. A intensidade orienta alvos discretos para irritação/raiva; não é um controle acústico contínuo validado.
- **Retorno:** `deliveryApplied` passa a ser booleano nos eventos. Só fica verdadeiro no segmento que recebe áudio do adaptador com confirmação do controle enviado. Esse valor não comprova fidelidade acústica, raiva percebida ou qualidade da voz. Metadados ausentes/inválidos e reservas sem suporte não anunciam controle aplicado.

Os controles nativos seguem os tipos oficiais de [configuração de geração](https://github.com/cartesia-ai/cartesia-python/blob/main/src/cartesia/types/generation_config_param.py) e [emoções](https://github.com/cartesia-ai/cartesia-python/blob/main/src/cartesia/types/emotion.py). O efeito com as vozes principal e reserva depende de escuta posterior.

## Como comparar na interface

Reinicie a API atualizada e recarregue a página. Selecione **Núcleo refinado**, informe o nome de tratamento escolhido e conecte. A preferência pessoal persiste entre sessões; não existe nome fixo no código.

| Modo | Fala | Expressão | Áudio |
| --- | --- | --- | --- |
| Paralelo | Somente prosa, com contrato de memória quando necessário | Classificador posterior, mediante consentimento | Começa sem esperar; expressão não altera áudio já sintetizado |
| Metadados com a fala | Cabeçalho do autor antes da prosa | Autor | Mantém comportamento anterior sem controles nativos |
| Voz expressiva | Cabeçalho do autor antes da prosa | Autor | Emoção encaminhada antes da síntese, sem segunda chamada de IA |

Compare os dois autores com os mesmos parâmetros e roteiro. O modo expressivo pode aumentar a espera pelo primeiro texto em relação ao paralelo; não se declara otimização sem medições reais. Os tempos de cabeçalho, primeiro segmento falável, primeiro áudio do TTS e fim da fala até áudio continuam medidos. Os quatro presets artísticos e snapshots de versão de voz não passam a representar vozes acusticamente aprovadas.

## Configuração e validação

`PERSONA_REFERENCE_MAX_EXAMPLES=6`, dois blocos de história e 6.000 caracteres são tetos, não metas de envio. Podem afetar custo e processamento, mas não habilitam emoção vocal. O timeout de recuperação é mantido. A linha duplicada de `VOICE_REFERENCE_DIRECTORY` com o mesmo valor não explica os sintomas. Não foram alteradas chaves, cotas, provedores nem consentimentos no `.env`.

Os testes usam memória em banco temporário, HTTP simulado e WebSocket local. Conferem persistência e isolamento do vocativo, exclusão em cenários sintéticos, núcleo na recuperação, revisão factual, expressão antes do TTS, confirmação somente após PCM e reserva sem controles. Nenhuma chamada externa de LLM, STT ou Cartesia é necessária para essas verificações.

Naturalidade, expressividade audível e fidelidade à persona continuam exigindo avaliação das conversas reais. Não há promoção automática do Jev à escolha do autor, nem nova rodada paga autorizada por este ajuste.

## Resultado local

`npm run check` passou: formatação, lint, tipos, **657 testes em 99 arquivos** e compilação. O cliente de chamada passou **48 testes**; a interface de voz passou **16**. Os recursos foram importados também da compilação: núcleo anterior com 9.901 caracteres, refinado com 8.134. Essa redução de contexto não prova redução proporcional de latência.

A preferência de tratamento já autorizada foi gravada no banco local do proprietário, preservando sua direção existente. O nome não foi incorporado como regra fixa do projeto. Não foram executadas chamadas remotas nem síntese real.
