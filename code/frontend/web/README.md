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

- **Expressões:** oito atalhos, catálogo de 177 expressões com busca e filtros, composição de emoção/intenção e 10 movimentos. O botão **Mão no queixo / trocar braços** mantém a pose independente do rosto.
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

### Paleta inspirada no anime

`src/features/avatar/runtime/avatar-palette.mjs` aplica uma correção de cores somente ao avatar, usando um filtro Pixi/WebGL. `ANIME_PALETTE` concentra os ajustes de cabelo vermelho-acastanhado, íris azul-violeta, pele marfim, jaleco frio e gravata vermelho-escura. O cabelo varia entre sombras mais marrons e reflexos vermelhos; pele e jaleco preservam a luminosidade da textura, evitando clareamento que apague o volume. `enabled: false` restaura as cores originais; `strength` ajusta a intensidade entre 0 e 1.

O atlas PNG e o rig permanecem intactos. O filtro preserva transparência e contornos, não adiciona um relógio de animação e é destruído com o renderer. A alteração aproxima a paleta da referência enviada; não transforma o traço/texturização do modelo no desenho do anime. O filtro acrescenta uma passagem de renderização WebGL; a conferência headless valida funcionamento, sem substituir a avaliação de fluidez no equipamento do usuário.

Sem conexão com a API de conversa, autenticação, STT, TTS ou banco. O movimento da boca é demonstrativo, sem sincronização fonética. As expressões demonstram o rig; sua disponibilidade não equivale à aprovação canônica da atuação. O catálogo, a composição de gestos e sua proveniência estão documentados em [acting/README.md](../assets/avatar/acting/README.md).

## Verificar

```powershell
npm test
npm run typecheck
npm run check:ui
npm run check:acting
npm run check:motions
```

`npm test` não precisa dos binários privados. `check:ui` requer o modelo, os runtimes locais e Chrome instalado. Usa navegador headless com perfil temporário, bloqueia solicitações externas e grava imagens em `.cache/web-preview/`. Para Edge, configure `UI_BROWSER_CHANNEL=msedge`.

`check:acting` percorre as 177 seleções no rig real, confere faixas e liberação de parâmetros, executa os 10 movimentos e valida a pose dos braços. Também verifica composição, responsividade e hashes dos arquivos originais. Imagens ficam em `.cache/acting-preview/`; esse teste não usa serviços de IA nem voz. `npm run avatar:generate` regenera o catálogo a partir das especificações locais.

`check:motions` confere a virada emburrada com olhos fechados e a surpresa com recuo. A inclinação aproximada e o gesto leve dos braços foram removidos após rejeição visual. Verifica parâmetros no rig real, prioridade sobre o cursor, retorno do enquadramento e preservação dos arquivos originais. As capturas ficam em `.cache/motion-preview/`. As poses novas usam o rig extra v16 descrito abaixo, separado do modelo original.

A conferência cobre renderização, oito opções de reação, desktop, celular, paisagem, texto seguro, preferências, teclado, falha de carregamento e tentativa de recuperação. Inclui remoção do monitor, zoom alternado 41 vezes e trocas de expressão, verificando que o slider não avança o tempo da animação e que o ticker compartilhado permanece desligado. Resultados e limites em [Interface_Live2D_2026-10-09.md](../../../docs/analysis/Interface_Live2D_2026-10-09.md).


Para exportar uma base de desenhos originais em camadas, execute `npm run avatar:export-base`. A ferramenta grava PSDs e PNGs locais em `../assets/avatar/local/authoring-v1/`, com inspeção offline em `index.html`. Ela não recupera o projeto Cubism. O plano de peças e controles fica em [authoring/README.md](../assets/avatar/authoring/README.md).

## Rig extra v16

No painel **Expressões e movimentos → Poses do rig extra**, escolha braços cruzados, mão na cintura, indicador levantado ou inclinação. **Avatar original** restaura o modelo anterior e suas expressões. O controle de mão no queixo também retorna ao original. A seleção de pose permanece no store durante a sessão, sem autenticação ou chamadas de IA.

A exportação SDK 5.3 usa opacidade de grupos offscreen; convertê-la para SDK 5.0 sobrepõe os corpos das poses. Por isso o renderer adicional usa o SDK oficial **Cubism Web R5**, WebGL2 e um iframe de mesma origem. Core e shaders ficam isolados do Pixi/Core original. Não há segundo ticker: o relógio existente atualiza o modelo original, transmite seus parâmetros comuns e desenha o extra. O renderer original deixa de desenhar enquanto o extra está visível; seus controles permanecem ativos. Escala, enquadramento e apresentação de movimentos acompanham as preferências. A pose dos braços troca por chave exata, enquanto a inclinação interpola durante 450 ms de simulação. Nenhum parâmetro físico inexistente é criado.

Assets locais, ignorados pelo Git:

- `../assets/avatar/local/extra-rig/v16/`: `Amadeus-rig-v16.model3.json`, `.moc3`, `.cdi3.json` e `Amadeus-rig-v16.4096/texture_00.png`, copiados da exportação fornecida com o CMO3.
- `../assets/avatar/local/extra-rig/sdk/CubismSdkForWeb-5-r.5/`: pacote oficial do [SDK Web](https://www.live2d.com/en/sdk/download/web/). Preservar licenças do SDK/Core.
- `../assets/avatar/local/extra-rig/runtime/`: bundle do renderer, Core, shaders e HTML/CSS de isolamento.

`npm run avatar:build-extra` gera o bundle do SDK local. `predev`/`prebuild` também o regeneram quando o pacote está presente. Se houver apenas o bundle já preparado, a cópia pública continua funcionando. Sem os arquivos privados, a interface mantém o avatar original e avisa ao tentar carregar uma pose extra. O servidor não expõe CMO3/PSD nem aceita arquivos arbitrários pelo mount adicional.

`npm run check:extra-rig` verifica as quatro poses no navegador, geometria finita, transparência, retorno ao original, seleção facial, celular, desmontagem e preservação dos hashes originais. Bloqueia rede externa e não usa serviços de voz. Imagens e resultados ficam em `.cache/extra-rig-preview/`. A chamada de inspeção faz readback apenas na análise/testes, não em cada frame. A fluidez real deve ser conferida no equipamento do usuário; os testes com SwiftShader não medem desempenho de GPU física.

O v16 **não tem todos os controles faciais concluídos**: sobrancelhas, blush e formato da boca não apresentaram mudança de geometria/opacidade na análise. MouthOpen altera opacidade de uma peça. XY da cabeça responde nas poses de braço 1/2/3 sem inclinação, mas não no extremo inclinado. Há emendas de recortes/áreas ocultas visíveis com certos movimentos. Essas limitações pertencem à exportação fornecida; não foram escondidas com alteração das texturas. A integração preserva as cores authored do extra, sem aplicar novamente o filtro de paleta do original. Proveniência e controles medidos em [extra-rig-v16.json](../assets/avatar/authoring/extra-rig-v16.json).
