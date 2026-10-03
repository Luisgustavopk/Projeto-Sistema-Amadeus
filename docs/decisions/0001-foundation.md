# Fundação

A documentação fica em `docs/` e o código em `code/`. O código se divide em `frontend/` e `backend/`. Scripts, configurações de desenvolvimento, dependências e dados locais da API ficam em `code/backend/api/`. A raiz contém apenas a organização do projeto e as configurações do repositório.

API como pacote independente gerenciado por npm; Fastify; schemas Zod internos ao backend; SQLite acessado por Drizzle e libSQL local. Serviços Python de áudio pertencem ao backend. React e Tauri estão previstos para o frontend, que permanece reservado até a definição da interface.

A credencial inicial é um token local de proprietário único. A saúde mínima é pública; capacidades e OpenAPI são protegidos. Rotacionar o token requer editar `.env` e reiniciar. Cotas, tickets de voz e política de envio à nuvem ainda serão implementados antes de integrar provedores.

Frontend e backend se integram por contratos HTTP/WebSocket, sem compartilhar pacotes de código. O OpenAPI é gerado pelo backend; a geração de tipos no frontend a partir desse documento fica para a implementação do cliente. Eventos de voz terão um contrato próprio documentado.
