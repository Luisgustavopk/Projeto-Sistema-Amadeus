# Frontend

Área reservada ao cliente React, ao avatar Live2D e ao aplicativo desktop Tauri. A interface será discutida antes da implementação: não há telas, aplicação web ou prévia nesta estrutura inicial.

- `assets/avatar/`: espaço para os recursos do Live2D.
- `desktop/`: espaço para o empacotamento Tauri.

O cliente será implementado aqui e terá seu próprio acesso à API por HTTP/WebSocket, sem importar código do backend. O backend publica o contrato HTTP em OpenAPI; os tipos do cliente poderão ser gerados a partir desse documento. O protocolo WebSocket será documentado separadamente.
