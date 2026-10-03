# Protocolo de voz

A fundação do protocolo está implementada. O contrato versionado é publicado em `GET /v1/voice/protocol`, protegido por autenticação. Ele define emissão e validade de tickets, origem, negociação, formato de áudio, limites, eventos e códigos de encerramento.

O canal `/v1/conversations/:id/call` consome um ticket temporário de uso único. Na fase 0, aceita `session.start`, `ping` e `session.end`, anuncia `voiceAvailable: false` e rejeita áudio binário. As conexões de diagnóstico expiram em 60 segundos. Áudio, geração e recuperação de contexto serão implementados nas fases seguintes; seus eventos futuros estão identificados no contrato.

Cada reconexão exige um novo ticket. Fora de loopback, configure HTTPS/WSS e uma origem HTTPS permitida.
