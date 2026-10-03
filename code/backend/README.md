# Backend

- `api/`: Fastify/TypeScript, casos de uso, contratos, persistência SQLite, políticas e coordenação de chamadas.
- `services/`: processos Python locais de STT (faster-whisper) e TTS (Chatterbox Multilingual).
- `assets/`: recursos da persona e perfis de voz; gravações privadas ficam fora do Git.
- `evals/`: reservado para avaliações ampliadas das próximas fases.

A fase 1 acrescenta pipeline de voz, Gemini, perfil personalizado, interrupção, confirmação de reprodução e métricas. A integração está coberta por testes controlados. A chave Gemini, a referência vocal original e os benchmarks reais ainda precisam ser preparados para o aceite operacional.

Guia de implantação: [Serviços locais](services/README.md). Contrato: [Protocolo da fase 1](../../docs/websocket/phase-1.md). Cliente sem interface: [call-client](../frontend/call-client/README.md).
