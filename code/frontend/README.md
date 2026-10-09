# Frontend

Área do cliente, do avatar Live2D e do aplicativo desktop Tauri.

- `voice-test/`: interface local temporária para testar a fase 1.
- `call-client/`: cliente independente de HTTP/WebSocket e Web Audio.
- [web/](web/README.md): interface React/TypeScript organizada por features, com Vite e o modelo novo da Kurisu; execução local na porta 4176, ainda sem API ou autenticação.
- [avatar-preview/](avatar-preview/README.md): visualizador independente dos dois candidatos de avatar.

- `assets/avatar/`: espaço para os recursos do Live2D.
- `desktop/`: espaço para o empacotamento Tauri.

A futura integração da interface com a conversa usará HTTP/WebSocket, sem importar código do backend. O backend publica o contrato HTTP em OpenAPI; os tipos do cliente poderão ser gerados a partir desse documento. O protocolo WebSocket será documentado separadamente.
