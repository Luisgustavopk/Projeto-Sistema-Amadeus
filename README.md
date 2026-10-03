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

## Separação entre frontend e backend

Cada camada mantém seu código e suas dependências. O backend define e valida os schemas da API e publica o contrato HTTP em OpenAPI. O frontend terá seu próprio cliente HTTP/WebSocket, sem importar módulos do backend. Futuramente, seus tipos poderão ser gerados a partir do OpenAPI. O protocolo WebSocket será documentado separadamente.

## Estado atual

A base da API inclui autenticação por token, saúde, declaração de capacidades, OpenAPI e migração inicial do SQLite. Há testes e configuração de CI. Esta estrutura inicia a fase 0; não conclui todos os requisitos dessa fase.

O frontend está reservado. Não há interface implementada ou prévia web. Voz personalizada, Live2D e aplicativo desktop permanecem no escopo e serão implementados nas fases previstas, após as definições necessárias.

Ainda faltam na fase 0: adaptadores reais e seu registro de capacidades, controle de consumo, política de dados, detalhes do protocolo de voz e tickets e estratégia de HTTPS para exposição externa.

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
- `npm start`: iniciar a API compilada.

## Rotas da base da API

- `GET /v1/health`: saúde mínima pública.
- `GET /v1/capabilities`: capacidades reais; exige `Authorization: Bearer <token>`.
- `GET /v1/openapi.json`: contrato gerado; exige a mesma autenticação.

O token está em `.env` e não deve ser enviado ao Git ou incluído no frontend. As capacidades ainda não implementadas são declaradas como falsas. Não há contas, chaves de provedores ou chamadas de IA configuradas.

## Documentos

- [Plano e fases](docs/project/Plano_Projeto_Amadeus.md)
- [Requisitos em PDF](docs/project/Requisitos_API_Amadeus_v2.pdf)
- [Requisitos editáveis](docs/project/Requisitos_API_Amadeus_v2.md)

Git local na branch `main`, sem remoto configurado. Nenhuma licença de distribuição foi escolhida.
