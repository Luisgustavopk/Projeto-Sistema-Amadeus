# Interface Amadeus + Live2D

Cliente visual independente, em React e TypeScript com Vite, organizado por features e baseado no wireframe fornecido pelo usuário. Mantém a identidade âmbar, a logo e a composição de monitor, com o modelo **Kurisu Cubism 3+** escolhido anteriormente. O vídeo e o poster do wireframe não são utilizados.

O refinamento visual usa `bg.mp4` e `01-11-15.mp4` como referências: fundo azul com fragmentos ciano na conversa, terminais vermelhos animados na entrada, scanlines e ruído de TV nos painéis e botões. As camadas são reconstruídas em Canvas/CSS; não são cópia quadro a quadro, pois os vídeos incluem personagem gravada, interface, barra do Windows e marca do gravador. Nenhum vídeo de referência é servido pelo cliente. Rastreabilidade em [effects.provenance.json](src/assets/effects.provenance.json).

## Executar

Com Node.js 24, a partir da raiz do repositório:

```powershell
cd code/frontend/web
npm ci
npm start
```

Abra <http://127.0.0.1:4176>. O comando verifica os tipos, gera o build com Vite e inicia o servidor local. Para desenvolvimento, use `npm run dev`, com atualização automática por HMR. Para outra porta, configure `AMADEUS_WEB_PORT`. `npm run preview` serve o último build com o preview do Vite.

As rotas são `/login` (entrada demonstrativa) e `/` (tela principal). A guarda exige apenas a sessão local aberta pelo botão de entrada; não autentica no backend. Recarregar encerra essa sessão e volta à entrada. O histórico e a reação escolhida sobrevivem à navegação entre as telas, mas não ao recarregamento. As preferências continuam em `localStorage`.

## Controles

- **Expressões:** neutra e sete reações faciais do rig; legenda demonstrativa para cada reação.
- **Microfone:** ícone como no wireframe; inicia/encerra uma demonstração do movimento da boca, sem som ou acesso ao microfone.
- **Canal de texto:** registro local das mensagens digitadas. Não gera respostas de IA.
- **Histórico:** consulta, limpeza e exportação TXT da sessão; não persiste após recarregar a página.
- **Configurações:** legendas, olhar seguindo o cursor, textura de monitor e enquadramento. Somente essas preferências são salvas em `localStorage`.
- **Tela cheia e retorno:** controles locais; o renderer pausa na aba oculta e libera seus recursos ao sair da tela principal.

Os painéis usam diálogos nativos, navegação por teclado, fechamento por Escape e devolução do foco. A Kurisu permanece animada na tela principal, conforme solicitado; os controles de pausa foram removidos e preferências antigas de pausa são ignoradas. O renderer pausa apenas fora da tela principal ou com a aba oculta. O olhar usa alvos proporcionais e limitados em toda a tela principal, incluindo margens e controles. A suavização usa tempo transcorrido, sem ultrapassar o alvo ao inverter a direção. Sair do canvas estreito não recentraliza o olhar; sair da tela ou perder o foco da janela recentraliza.

Em desktop acima de 900 px e com altura acima de 620 px, o avatar fica 25% mais próximo em relação ao enquadramento anterior. Celular e telas baixas mantêm o enquadramento anterior. **Efeito de tela** desliga scanlines, varredura e ruído. O fundo usa apenas um ciclo de animação a até 24 FPS, pausa em aba oculta e limita a resolução a 1,5× a dimensão CSS.

Para ajustar a textura da tela principal:

- `src/lib/visual-effects.mjs`: `STAGE_NOISE_OPACITY`, aplicada na função `drawStage()`. O valor atual `0.002` mantém a intensidade existente; `0` remove o ruído granulado.
- `src/styles/globals.css`: `--main-scanline-opacity`, padrão `0.10`. Ajusta as linhas horizontais da tela principal; `0` as oculta. As scanlines da entrada e o ruído de botões/pop-ups usam estilos separados.

Os botões de ícone e o microfone usam a textura fixa do wireframe: `radial-gradient(rgba(223,149,28,.8) .45px, transparent .75px)`, repetida em células de 3 × 3 px, com opacidade 0,2. Painéis usam a variação do mesmo wireframe (células de 3,5 px). Essas texturas não têm animação de ruído; as scanlines e a varredura continuam independentes.

## Arquivos do avatar

`scripts/prepare-public.mjs` copia os recursos locais existentes antes de desenvolver ou compilar. Não há download ou CDN durante o uso:

```text
public/live2d/
  amadeus/Kurisu.model3.json   # nome original e referências internas preservados
  runtime/
    pixi.min.js
    live2d.min.js
    live2dcubismcore.min.js
    live2d-display.min.js
```

As fontes da cópia ficam em `../assets/avatar/local/modern/Kurisu` e `../assets/avatar/local/viewer-runtime`. Os binários e as cópias em `public/live2d` continuam ignorados pelo Git. Em outra máquina, restaure-os a partir das fontes registradas em [kurisu-sources.manifest.json](../assets/avatar/kurisu-sources.manifest.json) e [runtime.manifest.json](../avatar-preview/runtime.manifest.json), conferindo os hashes. A logo está em `src/assets` e tem rastreabilidade em [logo.provenance.json](src/assets/logo.provenance.json).

O renderer usa PixiJS 6.5.10 e pixi-live2d-display 0.4.0, conforme os runtimes já preparados. O pacote `playwright-core` é somente uma dependência de desenvolvimento. A [documentação do renderer](https://github.com/guansss/pixi-live2d-display/tree/v0.4.0) descreve a integração entre Pixi e os runtimes Cubism.

## Organização

```text
public/live2d/              modelo e runtimes locais (ignorados pelo Git)
public/media/               mídia pública adicional
src/app/                   main.tsx, router.tsx, providers.tsx
src/routes/                páginas finas: login.tsx e index.tsx
src/features/auth/         entrada, sessão local e useLogin
src/features/avatar/       Live2D, expressões, estado e adaptadores do rig
src/features/chat/         mensagens, store, tipos e composição da conversa
src/features/voice/        botão, legenda, linhas e demonstração de fala
src/features/history/      consulta, exportação e limpeza
src/features/settings/     painel, preferências e store
src/features/system/       diagnóstico visual
src/components/ui/         Button, Switch, Slider e Select
src/components/hud/        cabeçalho, rail, telemetria, frame e painéis
src/hooks/                 comportamento genérico e avisos
src/lib/                   cliente HTTP, configuração, utilitários e Canvas
src/i18n/                  provider e dicionários pt-BR, en e ja
src/styles/                tokens.css e globals.css
src/assets/                logo, ícones e proveniência
src/types/                 contratos compartilhados e configuração Vite
tests/                     relógio, HTTP, preferências e cliente HTTP
scripts/                   preparação dos assets e regressão de navegador
.env.example               configuração pública da futura API
vite.config.ts / tsconfig.json build, desenvolvimento e checagem de tipos
server.mjs                 entrega do build local com limites de arquivos
```

Para remover o **Signal monitor**, defina `data-signal-monitor="false"` no elemento `#root` de `index.html`. Ele é um componente opcional: o renderer e as expressões não dependem dos seus elementos.

Componentes renderizam a interface; hooks controlam estado, timers e eventos com limpeza ao desmontar. Stores por feature usam contextos React. Páginas montam features; elementos reutilizáveis ficam no HUD/UI. Os adaptadores Live2D/Canvas mantêm seu relógio fora das renderizações React. Esses adaptadores preservam os módulos `.mjs` já validados, com fronteiras tipadas para o TypeScript. O build gerado em `dist/` é ignorado pelo Git; o servidor de produção não expõe os arquivos-fonte.

Os tokens de cor mantêm os valores anteriores para preservar a aparência. O provider aplica o tema escuro atual. Os dicionários internacionais e o cliente HTTP são bases para integração futura: apenas o botão de entrada e avisos de preferências usam a tradução nesta etapa. `VITE_API_URL` é público e não deve conter chaves. `features/auth/api.ts` e `features/chat/api.ts` não fazem chamadas remotas automaticamente. Não foram adicionados endpoints fictícios nem uso dos serviços de voz.

O Live2D usa `autoUpdate: false` e um ticker privado do renderer. O zoom altera somente escala/posição; não avança o tempo nem liga um segundo ticker. Trocar expressões também não cria listeners de animação. Essa separação evita a aceleração acumulada ao ajustar o slider ou selecionar reações repetidamente.

Sem conexão com a API de conversa, autenticação, STT, TTS ou banco. O movimento da boca é demonstrativo, sem sincronização fonética. As expressões disponíveis demonstram o rig, sem validar a atuação canônica da persona ou todo o catálogo de movimentos.

## Verificar

```powershell
npm test
npm run typecheck
npm run check:ui
```

`npm test` não precisa dos binários privados. `check:ui` requer o modelo, os runtimes locais e Chrome instalado. Usa navegador headless com perfil temporário, bloqueia solicitações externas e grava imagens em `.cache/web-preview/`. Para Edge, configure `UI_BROWSER_CHANNEL=msedge`.

A conferência cobre renderização, oito opções de reação, desktop, celular, paisagem, texto seguro, preferências, teclado, falha de carregamento e tentativa de recuperação. Inclui remoção do monitor, zoom alternado 41 vezes e trocas de expressão, verificando que o slider não avança o tempo da animação e que o ticker compartilhado permanece desligado. Resultados e limites em [Interface_Live2D_2026-10-09.md](../../../docs/analysis/Interface_Live2D_2026-10-09.md).
