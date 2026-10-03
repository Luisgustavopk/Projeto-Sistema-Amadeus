# Protocolo de voz - fase 1

O protocolo 1.0 da fundação permanece compatível. Para áudio e texto em chamadas, negocie 1.1. O contrato completo é publicado em GET `/v1/voice/protocol`, campo `voicePipeline`.

## Fluxo

1. Crie a conversa em POST `/v1/conversations`.
2. Obtenha ticket com POST `/v1/conversations/:id/call-tickets`, Bearer da API e `{origin}`.
3. Conecte em `/v1/conversations/:id/call?ticket=...`, com a origem autorizada.
4. Envie `session.start` com versão 1.1 e áudio PCM s16le, mono, 16000 Hz, 20 ms. Aguarde `session.ready` antes dos outros eventos.
5. `speech.start` abre turno; quadros binários carregam a fala; `speech.end` inicia processamento. `text.send` também inicia um turno.
6. Receba `transcript.final`, `reply.start`, `reply.text`, `audio.segment` e quadros PCM; `reply.done` indica fim da geração.
7. Confirme `playback.progress` com responseId, segmentId e playedSamples. `playback.ended` informa fim da reprodução e não substitui essas confirmações.
8. `interrupt` cancela captura/geração. Um turno novo também cancela o anterior. `session.end` encerra e persiste uma tarefa de memória pendente.

Cada turnId deve ser inteiro positivo crescente, até uint32. Um ticket é consumido uma única vez; nova conexão exige outro ticket. Retomada automática está na fase 3.

## Quadros

648 bytes: uint32 little-endian de sequência no offset 0, uint32 de turnId no offset 4, seguido de 640 bytes de PCM. A sequência começa em zero por fala de entrada ou segmento de saída. `audio.segment` associa responseId e segmentId à sequência binária imediatamente seguinte. O último quadro de saída pode ter zeros adicionais: sampleCount informa a duração real, sem preenchimento.

Entrada: 5 a 1500 quadros (100 ms a 30 s). Controle JSON: até 8192 bytes; o limite de bytes vale mesmo para textos com até 4000 caracteres. Conexão: até 30 minutos; controles: 600/min; confirmações: 180/min. Limites e backpressure protegem RAM e transporte.

## Contexto, privacidade e falhas

Sem dataClass, a chamada usa `personal`. `synthetic` é reservado a conteúdo artificial de teste. Serviços loopback podem receber `local-approved` após revisão do operador; conteúdos `local-only` nunca seguem para Gemini. `personal-approved` exige data e URL da política revisada.

O Gemini entrega texto por SSE. Uma fila limitada segmenta frases prontas e inicia TTS antes do fim da geração. Cada trecho passa por TTS completo e só então seus quadros são enviados. O adaptador genérico http-json continua com geração completa como alternativa; o TTS não anuncia inferência incremental.

Falha STT permite continuar enviando texto. Falha TTS mantém `reply.text` e emite `TTS_UNAVAILABLE_TEXT_AVAILABLE`. Cotas geram `quota.warning`; não há mudança automática para plano pago. Em um turno ocioso, o operador pode atualizar os provedores pela rota existente. Controles inválidos e sequências incorretas encerram a conexão com 1008.

O histórico mantém texto gerado, quantidade de áudio e amostras reproduzidas. Somente segmentos inteiros confirmados entram no contexto de fala; um trecho parcialmente reproduzido permanece registrado, mas é excluído desse contexto para não inventar palavras ouvidas.
