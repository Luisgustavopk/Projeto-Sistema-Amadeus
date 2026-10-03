# Projeto Amadeus

Estrutura inicial do projeto. A documentação está em `docs/` e o código em `code/`.

## Organização

```text
amadeus/
├── docs/                      # Documentação
│   ├── project/               # Plano e requisitos aprovados
│   ├── decisions/             # Decisões de arquitetura
│   └── websocket/             # Proposta do protocolo de voz
├── code/                      # Código do projeto
│   ├── frontend/              # Reservado; interface ainda a definir
│   │   ├── desktop/           # Futuro empacotamento Tauri
│   │   └── assets/avatar/     # Futuros recursos Live2D
│   └── backend/
│       ├── api/               # API, ferramentas, dependências e dados locais
│       ├── services/          # Futuros serviços STT e TTS
│       ├── assets/            # Persona e perfis de voz
│       └── evals/             # Futuras avaliações
└── .github/workflows/         # Verificações automatizadas
```

Na raiz ficam `code/`, `docs/`, este README e as configurações de repositório: `.git`, `.github`, `.gitignore`, `.gitattributes` e `.editorconfig`.

As configurações de Node, TypeScript, testes e formatação ficam em `code/backend/api/`. Essa pasta também contém `scripts/` e, localmente, `node_modules/`, `data/` e `.env`; dependências, dados e segredos são ignorados pelo Git.

Dentro da API, `src/bootstrap/` monta as dependências e o servidor; `src/config/` valida a configuração por assunto; `src/http/` contém rotas, schemas, controllers e hooks HTTP; `src/realtime/` contém a rota, autorização e sessão WebSocket. Os serviços de aplicação ficam em `src/application/`, as interfaces em `src/ports/` e as integrações em `src/adapters/`. Os testes ficam fora de `src`, em `tests/unit/` e `tests/integration/`.

As rotas ficam em `http/routes/` e `realtime/routes/`, com seus contratos em subpastas `schemas/`. As exceções são agrupadas por assunto em `domain/errors/`; `http/errors/` transforma essas exceções em respostas HTTP. `http/observability/` separa métricas de logs. No WebSocket, `realtime/controllers/` adapta a requisição, `realtime/protocol/` define o contrato e `realtime/session/` coordena leitura de mensagens, estado, timers e transporte.

Em `application/`, os módulos `conversations/`, `calls/`, `providers/` e `diagnostics/` implementam os casos de uso. `runtime/activity-gate.ts` coordena chamadas e execuções com as mudanças de configuração. As interfaces em `ports/` mantêm a aplicação independente dos repositórios SQLite. Os controllers recebem serviços específicos, e somente `bootstrap/` monta as implementações concretas.

## Separação entre frontend e backend

Cada camada mantém seu código e suas dependências. O backend define e valida os schemas da API e publica o contrato HTTP em OpenAPI. O frontend terá seu próprio cliente HTTP/WebSocket, sem importar módulos do backend. Futuramente, seus tipos poderão ser gerados a partir do OpenAPI. O protocolo WebSocket será documentado separadamente.

## Estado atual

A fase 0 inclui autenticação por token, isolamento por proprietário, diagnóstico protegido, configuração persistente dos adaptadores, consumo e orçamento, política de envio de dados, OpenAPI e negociação do protocolo de voz por tickets temporários. A fundação usa SQLite, testes e CI.

O frontend está reservado. Não há interface implementada ou prévia web. Voz personalizada, Live2D e aplicativo desktop permanecem no escopo e serão implementados nas fases previstas, após as definições necessárias.

Os adaptadores `disabled` e `http-json` estão implementados. O segundo comunica-se com serviços que seguem o contrato de `/v1/providers/protocol`; as integrações específicas de modelos e o processamento de áudio serão implementados na fase 1. O transporte atual desse adaptador é JSON completo, sem streaming nativo. A disponibilidade do serviço e suas capacidades declaradas são informadas separadamente das funcionalidades completas da Amadeus.

HTTP é permitido em loopback. Para expor a API na rede, configure `TLS_CERT_FILE`, `TLS_KEY_FILE` e origens HTTPS em `ALLOWED_ORIGINS`. O servidor inicia com HTTPS/WSS; certificados e chaves locais ficam fora do Git. Sem uma origem configurada, clientes de navegador são bloqueados.

## Preparar o ambiente

Requisitos: Node.js 24 LTS e npm (incluído no Node.js). A partir da raiz do repositório:

```sh
cd code/backend/api
npm ci
npm run setup
npm run check
```

O setup gera uma credencial aleatória em `.env` e preserva configurações existentes. Para iniciar apenas a API, execute `npm run dev`. Ela atende em http://127.0.0.1:3001 e aplica as migrações ao iniciar.

Todos os comandos abaixo são executados em `code/backend/api/`.

`npm` instala as dependências e executa os scripts do `package.json`. O `package-lock.json` registra as versões; `npm ci` instala exatamente essas versões.

## Comandos

- `npm run dev`: iniciar somente o backend.
- `npm run check`: verificar formatação, lint, tipos, testes e compilação.
- `npm run build`: compilar a API.
- `npm run db:migrate`: aplicar as migrações do SQLite.
- `npm run check:api`: verificar a API em execução com a credencial local, sem interface gráfica.
- `npm start`: iniciar a API compilada.

## Rotas da base da API

- `GET /v1/health`: saúde mínima pública.
- `GET /v1/health/details`: diagnóstico protegido do banco e dos adaptadores.
- `GET /v1/capabilities`: capacidades reais; exige `Authorization: Bearer <token>`.
- `GET /v1/openapi.json`: contrato gerado; exige a mesma autenticação.
- `GET /v1/usage` e `GET /v1/metrics`: orçamento, consumo e indicadores técnicos protegidos.
- `GET /v1/providers` e `PUT /v1/providers`: consultar e alterar adaptadores e suas políticas, sem enviar chaves no corpo.
- `GET /v1/voice/protocol` e `GET /v1/providers/protocol`: contratos versionados de voz e integração dos serviços.
- `POST /v1/conversations`: criar a identidade de uma conversa para o ticket. Histórico e gerenciamento completo pertencem às próximas fases.
- `POST /v1/conversations/:id/call-tickets`: emitir ticket de uso único, vinculado à conversa, origem e credencial.
- `WS /v1/conversations/:id/call`: negociar versão/formato, testar ping e encerrar. Áudio, geração e retomada ainda não estão ativos.

O token está em `.env` e não deve ser enviado ao Git ou incluído no frontend. As capacidades ainda não implementadas são declaradas como falsas. Não há contas, chaves de provedores ou chamadas de IA configuradas.

## Documentos

- [Plano e fases](docs/project/Plano_Projeto_Amadeus.md)
- [Requisitos em PDF](docs/project/Requisitos_API_Amadeus_v2.pdf)
- [Requisitos editáveis](docs/project/Requisitos_API_Amadeus_v2.md)

Nenhuma licença de distribuição foi escolhida.
