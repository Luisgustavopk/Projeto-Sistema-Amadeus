# Frontend

Área do cliente, do avatar Live2D e do aplicativo desktop Tauri. A interface definitiva será discutida nas fases previstas.

- `voice-test/`: interface local temporária para testar a fase 1.
- `call-client/`: cliente independente de HTTP/WebSocket e Web Audio.

- `assets/avatar/`: espaço para os recursos do Live2D.
- `desktop/`: espaço para o empacotamento Tauri.

O cliente será implementado aqui e terá seu próprio acesso à API por HTTP/WebSocket, sem importar código do backend. O backend publica o contrato HTTP em OpenAPI; os tipos do cliente poderão ser gerados a partir desse documento. O protocolo WebSocket será documentado separadamente.
