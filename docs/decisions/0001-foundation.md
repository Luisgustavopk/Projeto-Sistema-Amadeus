# Fundação

A documentação fica em `docs/` e o código em `code/`. O código se divide em `frontend/` e `backend/`. Scripts, configurações de desenvolvimento, dependências e dados locais da API ficam em `code/backend/api/`. A raiz contém apenas a organização do projeto e as configurações do repositório.

API como pacote independente gerenciado por npm; Fastify; schemas Zod internos ao backend; SQLite acessado por Drizzle e libSQL local. Serviços Python de áudio pertencem ao backend. React e Tauri estão previstos para o frontend, que permanece reservado até a definição da interface.

O backend segue uma arquitetura em camadas com portas e adaptadores. `domain/` concentra modelos e políticas; `application/` organiza casos de uso por funcionalidade; `ports/` declara os contratos de persistência e integração; `adapters/` implementa esses contratos; `http/` e `realtime/` recebem requisições. `bootstrap/` monta as dependências. O ESLint impede imports de infraestrutura no núcleo e de adaptadores ou bootstrap nos módulos de transporte.

Conversas, tickets, configuração de provedores e consumo têm repositórios próprios. O orçamento é validado por uma política de domínio dentro da transação de reserva, preservando a atomicidade. Uma finalização de consumo não sobrescreve outra já concluída. O controle de atividade é compartilhado entre chamadas, execuções e configuração; a configuração exige ausência de chamadas e execuções, e bloqueia novas atividades enquanto é salva. Esse controle atua em uma única instância do processo, conforme a execução local da fase 0. Uma futura execução em múltiplos processos exigirá coordenação compartilhada.

A credencial inicial é um token local de proprietário único. A saúde mínima é pública; capacidades, diagnóstico, consumo, configuração e contratos são protegidos. Rotacionar o token requer editar `.env` e reiniciar, invalidando tickets anteriores. A fase 0 implementa tickets de uso único, reserva persistente de orçamento e bloqueio de dados incompatíveis antes do envio. Por padrão, os adaptadores ficam desabilitados; habilitar dados pessoais exige registro de revisão da política. HTTPS/WSS é obrigatório fora de loopback.

Frontend e backend se integram por contratos HTTP/WebSocket, sem compartilhar pacotes de código. O OpenAPI é gerado pelo backend; a geração de tipos no frontend a partir desse documento fica para a implementação do cliente. Eventos de voz terão um contrato próprio documentado.
