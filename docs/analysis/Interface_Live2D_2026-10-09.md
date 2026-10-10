# Interface visual + Live2D — 09/10/2026

## Escopo

Implementação na branch `feat/interface`, baseada no HTML funcional de `wireframe.zip`. Da pasta de assets foi copiada somente a logo, sem modificação. O vídeo e o poster não foram reutilizados. HTML, CSS e módulos JavaScript, sem framework de aplicação.

A interface utiliza o modelo selecionado pelo usuário, `local/modern/Kurisu/Kurisu.model3.json`, e os runtimes já preparados. Recursos servidos localmente na porta 4176; nenhum provedor de IA, voz, backend de conversa, autenticação ou banco participa desta etapa.

## Resultado

- Entrada visual sem credenciais, composição âmbar de monitor e avatar central em WebGL.
- Expressão neutra e sete reações faciais: sorriso, irritação, constrangimento, vergonha, surpresa, tristeza e medo.
- Prévia explícita de boca em movimento, sem som; olhar seguindo o cursor e animação ambiente configuráveis.
- Texto e histórico locais, exportação TXT, configurações persistidas, tela cheia e retorno à entrada.
- Diálogos nativos, foco por teclado, Escape e layout responsivo.

As frases de demonstração são conteúdo local. Não são respostas geradas, memórias, atividades autônomas ou sinais de aprovação da persona. A troca de braços e os movimentos que retiram a personagem de câmera não são usados nesta interface.

## Verificações

`npm test`: dois testes passaram, cobrindo entrega HTTP, limites dos diretórios públicos, bloqueio de métodos/hosts indevidos, ausência de acesso a arquivos privados e recuperação de preferências inválidas ou indisponíveis.

`npm run check:ui`: passou em Chrome headless com perfil temporário e WebGL. Conferências em 1440×900, 390×844 e 844×390, sem rolagem horizontal. Nenhuma solicitação externa ou exceção JavaScript não tratada foi registrada.

O teste percorreu as oito opções de reação e conferiu os parâmetros faciais reais durante a renderização, incluindo a remoção da reação anterior e o retorno à neutra. A inspeção detectou que transições pausadas podiam manter a pose anterior; o renderer foi corrigido para aplicar imediatamente a expressão selecionada quando a atualização automática está desligada, preservando a transição normal quando animado.

Também cobriu reprodução/parada da prévia, pausa ao voltar à entrada, retorno ao avatar, texto inserido como texto literal, foco e Escape, persistência do enquadramento e falha simulada de carregamento do modelo seguida de recuperação por “Tentar novamente”. Utilizou o renderer com animação automática habilitada e com preferência por movimento reduzido.

Capturas locais em `.cache/web-preview/`, ignoradas pelo Git: entrada, desktop, cada reação, chat, celular, configurações, paisagem e erro de carregamento. Todas essas telas foram inspecionadas visualmente. O enquadramento mantém o topo da cabeça ao ampliar; os controles em paisagem foram deslocados para evitar sobreposição com o cabeçalho.

## Limites e continuidade

### Refinamento CRT com referências em vídeo

Após a primeira implementação, o usuário solicitou maior proximidade da personagem no desktop e a animação dos vídeos `bg.mp4` e `01-11-15.mp4`. Os quadros foram inspecionados em reprodução e em diferentes pontos temporais: o primeiro contém a Kurisu gravada, enquanto o segundo contém logo, formulário, barra do Windows e marca do gravador. Ambos são composições finais, não fundos isolados.

As camadas foram reconstruídas em Canvas 2D e CSS, sem incorporar os vídeos: fragmentos ciano com brilho e rastros no fundo azul, painéis de código vermelho em rolagem, terminal de boot progressivo, saída de treinamento decorativa e reflexo de varredura. Isso reproduz a linguagem visual e os tipos de movimento, sem equivalência quadro a quadro. A fidelidade exata do fundo permanece dependente dos recursos de fundo separados.

Scanlines foram intensificadas na tela principal; painéis e botões da barra lateral recebem textura de ruído SVG e varredura, sempre sem interceptar cliques. Os efeitos têm controle de desativação. A personagem foi ampliada em 25% no desktop; mobile e paisagem baixa mantêm o enquadramento anterior.

O controlador de fundos trabalha a até 24 FPS, com resolução limitada a 1,5×, alterna apenas a tela visível e pausa em aba oculta. Preferências e acessibilidade permanecem funcionais. [Proveniência dos efeitos](../../code/frontend/web/assets/effects.provenance.json).

A verificação de navegador passou novamente após o refinamento. Além dos testes anteriores, confirmou mudança de quadros nos dois fundos animados, congelamento do canvas ao desligar a animação, ocultação das scanlines e do ruído ao desligar o efeito, com zero solicitações externas e zero exceções JavaScript não tratadas. Capturas adicionais: `welcome-animated.png` e `desktop-animated.png`, também inspecionadas visualmente. Os dois testes HTTP/preferências e a conferência de sintaxe passaram.

A verificação comprova renderização e funcionamento local, sem certificar FPS em todos os equipamentos, todos os movimentos do rig ou fidelidade canônica. A boca usa uma simulação temporal, sem fonemas ou áudio. O acervo binário continua local, com fontes e hashes preservados nos manifestos existentes.

Próxima integração: conectar os eventos da conversa ao renderer, os estados de fala/escuta aos controles e o áudio real ao movimento da boca. Isso não foi implementado nesta etapa, conforme o escopo solicitado.

### Histórico do controle explícito de animação (substituído)

Após o relato de visual estático, a inspeção identificou um bloqueio possível: `prefers-reduced-motion` pausava fundos, CSS e avatar mesmo com “Animação ambiente” ligada. Não foi inspecionada a configuração do sistema/navegador do usuário, portanto essa causa não foi confirmada no ambiente dele.

O movimento passou a usar uma regra compartilhada: a pausa manual sempre prevalece; a preferência do sistema é seguida quando a opção “Seguir movimento reduzido” está ligada. O padrão da prévia mantém a animação ativa, conforme solicitado. A tela de entrada recebeu controle de ativação/pausa com estado visível e persistente, inclusive para retomar uma preferência antiga de pausa. Nenhuma configuração do Windows é alterada. O logo permanece visível quando pausado, mesmo durante a animação inicial.

Os testes de navegador simulam movimento reduzido e verificam alteração de quadros dos dois fundos, pausa e retomada, persistência após recarga, pausa do CSS e atualização dos parâmetros reais do Live2D. A opção de seguir o sistema também pausa o renderer, sem afetar a prévia de fala acionada manualmente.

### Olhar proporcional e animação contínua

O vídeo `17-29-46.mp4` foi inspecionado. A revisão do runtime identificou que `Live2DModel.focus()` normaliza a direção para intensidade máxima, mesmo para deslocamentos pequenos perto do centro. O frontend passou a alimentar diretamente `focusController.focus()` com alvos proporcionais ao cursor, limitados a ±0,45 na horizontal e ±0,30 na vertical. A suavização continua no controlador do rig; ao sair da área ou desativar o acompanhamento, o alvo volta ao centro. Toque não aciona esse acompanhamento.

Por solicitação do usuário, os controles de pausa e de seguir movimento reduzido foram removidos. Preferências antigas relacionadas à pausa são descartadas na leitura. A Kurisu anima continuamente na tela principal e pausa apenas fora dela ou quando a aba está oculta. O botão de demonstração agora usa os ícones de microfone ligado/desligado do wireframe; permanece sem captura de áudio nem backend.

O ruído granulado do fundo principal foi desligado (`STAGE_NOISE_OPACITY = 0` em `modules/visual-effects.mjs`, função `drawStage`). As scanlines principais passaram de 0,24 para 0,10 via `--main-scanline-opacity` em `styles.css`. A textura da entrada, dos botões e dos pop-ups permanece independente.

A verificação de navegador passou após essa revisão: oito expressões com transições animadas, alvos de olhar proporcionais perto do centro e limitados nas bordas, retorno do alvo ao sair da área, avatar ainda animado com acompanhamento desligado, fundos em movimento mesmo com movimento reduzido simulado, ícone de microfone e recuperação após falha do modelo. Desktop, celular e paisagem foram verificados, com zero requisições externas e zero exceções JavaScript não tratadas. Os testes HTTP/preferências também passaram; preferências antigas de pausa são ignoradas.

### Textura do wireframe e acompanhamento entre áreas

Os ícones da barra lateral e o microfone passaram a usar exatamente os parâmetros de textura do HTML do wireframe: pontos âmbar de 0,45 px, transição para transparência em 0,75 px, célula de 3 × 3 px e opacidade 0,2. Os painéis usam a variação fixa de 3,5 px do mesmo wireframe. O ruído SVG animado foi removido dos estilos, assim como seus keyframes. Scanlines e varredura são efeitos separados.

A investigação seguinte identificou que os eventos estavam restritos ao canvas central de até 1.000 px: cruzar para margens ou controles disparava a recentralização. Agora os eventos são recebidos pela tela principal inteira. A suavização do controlador desta instância do rig foi substituída por aproximação exponencial com tempo transcorrido e passo limitado, sem ultrapassar o alvo em inversões de direção. O reset ocorre ao sair da tela, perder o foco da janela, deixar a tela principal ou desativar o acompanhamento; todos os listeners são removidos no descarte.

A checagem anterior verificava alvos por eventos sintéticos. A nova verificação inclui movimentos reais de mouse sobre margens, botões e cabeçalho, inversão direita → esquerda e parâmetros dos olhos coletados em `beforeModelUpdate`. Esse ponto de coleta é necessário porque o Cubism restaura os parâmetros base depois do desenho, tornando uma leitura isolada após o quadro inadequada para avaliar o olhar renderizado.

### Relógio único, partes HTML e controladores separados

A aceleração após zoom e expressão vinha de chamadas repetidas ao setter `Live2DModel.autoUpdate`, que adiciona um listener ao ticker compartilhado sem verificar se já está ligado. `configure()`, `stopSpeaking()` e mudanças de atividade passavam por esse setter. O enquadramento ainda avançava o modelo em 16 ms em cada atualização do slider.

O modelo agora nasce com `autoUpdate: false`; um único ticker privado do Pixi atualiza simulação e desenho, com passo limitado a 50 ms. Layout e expressão não adicionam listeners. O zoom altera somente escala/posição e redimensiona o renderer apenas quando a dimensão do host muda. A expressão é idempotente: selecionar a mesma expressão ou iniciar sua demonstração novamente não acusa indisponibilidade. Olhar, relógio, enquadramento e expressão têm módulos próprios; `avatar.mjs` coordena carregamento e ciclo de atividade.

`app.mjs` passou a montar controladores de preferências, reações, demonstração de fala, histórico, status, navegação e avisos. `index.html` tem 42 linhas e referencia partes em `partials/`; o servidor local monta o HTML completo antes de servir, sem framework ou carregamento de pedaços no navegador. `templates.mjs` permite somente partes conhecidas, rejeita ciclos e verifica os limites do diretório. Partes não referenciadas não são lidas.

O Signal monitor é opcional. Para removê-lo, basta remover seu comentário de inclusão em `partials/home.html`; os indicadores decorativos usam atualização tolerante à ausência. O teste de navegador remove o `aside` da resposta HTML e exercita carregamento, zoom, expressões e microfone nessa página.

A regressão passou com 41 mudanças de zoom, retorno a 100%, seis mudanças de expressão e demonstração repetida da expressão selecionada. O avanço do tempo durante o lote síncrono de zoom foi exatamente zero. O ticker compartilhado permaneceu desligado, a animação continuou e não houve erros JavaScript nem requisições externas. Os quatro testes locais passaram, incluindo composição sem arquivo de telemetria, bloqueio de inclusões inválidas e ativação repetida sem duplicar listeners. Os limites anteriores de validação permanecem: software WebGL headless verifica funcionamento, sem garantir FPS no equipamento do usuário.

### Migração para React

A etapa seguinte substituiu o compositor de partes HTML e os controladores DOM por React 19 com esbuild. `src/components/` contém telas, controles e diálogos; `src/hooks/` isola preferências, navegação, histórico e ciclo de vida dos renderers. O CSS, os recursos gráficos e os adaptadores de animação foram preservados. O carregamento do avatar agora também descarta resultados assíncronos após desmontagem. Nenhuma integração de backend foi acrescentada.

Os arquivos `app.mjs`, `templates.mjs`, `partials/` e os antigos controladores de UI foram removidos. O ponto de entrada é `src/main.jsx`; o HTML carrega o bundle local. O Signal monitor é controlado pela prop `showSignalMonitor` de `App`, sem dependência do renderer em seus elementos.

Build e três testes locais aprovados. A regressão de navegador passou com oito expressões, navegação, preferências, foco, texto seguro, falha/retry, zoom e remoção da telemetria. Foram comparadas posições, dimensões, fontes e cores de nove elementos na entrada, tela principal e configurações, em desktop e celular: nenhuma diferença entre as medidas antes/depois. Os quadros animados não são comparados pixel a pixel, pois variam com o tempo.

### Organização por features, TypeScript e Vite

Conforme a arquitetura solicitada, `/web/src` passou a conter `app`, `routes`, `features`, `components/ui`, `components/hud`, `hooks`, `lib`, `i18n`, `styles`, `assets` e `types`. As features são auth, avatar, chat, voice, history, settings e system. As páginas `/login` e `/` são finas; stores por feature usam contextos React e os componentes recebem contratos TypeScript. `app/providers.tsx` monta os providers; `app/router.tsx` aplica uma guarda de sessão local da demonstração.

Vite substitui o build anterior. O modelo e seus runtimes são copiados das fontes locais para `public/live2d/amadeus` e `public/live2d/runtime`, mantendo nomes e referências internas. As cópias continuam ignoradas pelo Git. `public/media` fica disponível para mídia adicional. Não foram ativadas autenticação remota nem chamadas de chat/voz; os contratos e o cliente HTTP ficam separados para a integração futura. A tradução cobre inicialmente o botão de entrada e avisos de preferências, com dicionários pt-BR, en e ja preparados.

Os tokens e regras de CSS preservam a aparência anterior. Os adaptadores Live2D e Canvas continuam em `.mjs` dentro de `src`, com fronteiras tipadas. Cada página limpa seus renderers ao desmontar; o histórico e a reação selecionada permanecem no store durante navegação. Pastas antigas `web/assets`, `web/modules` e `src/components/dialogs`, além dos pontos de entrada e scripts de build anteriores, foram removidos. `dist` e `node_modules` são saídas geradas utilizadas pelo projeto.

Validação: checagem estrita de tipos e build Vite aprovados; cinco testes locais aprovados, incluindo respostas JSON vazias/inválidas, erro HTTP, cancelamento e timeout. A regressão de navegador passou em desktop, celular e paisagem, com as oito expressões, zoom repetido, cursor, foco, texto seguro, preferências, falha/retry e remoção do Signal monitor. A conferência em Vite de desenvolvimento com StrictMode validou guarda, saída/retorno, histórico entre rotas e recarregamento, sem erros JavaScript. As medidas dos elementos visíveis comparadas à versão anterior tiveram zero diferenças em desktop e celular.

### Paleta inspirada na referência do anime

Após os quatro commits de organização, um filtro Pixi/WebGL passou a ajustar somente o avatar: cabelo castanho-avermelhado menos saturado, olhos azul-acinzentados, pele neutra, jaleco frio e gravata bordô. A configuração fica em `web/src/features/avatar/runtime/avatar-palette.mjs`; é reversível por `enabled` e `strength`. O filtro preserva alfa premultiplicado, evita os tons rosados do rubor e limpa seus recursos ao desmontar. Não adiciona timers ou tickers.

A comparação antes/depois usa o mesmo quadro congelado. O rubor também foi inspecionado diretamente com `ParamCheek = 1` no navegador de diagnóstico, para verificar a correção de cores independentemente do fade da expressão. O atlas original e a cópia pública mantêm o mesmo SHA-256. Build, cinco testes locais e regressão de navegador passaram; a conferência cobre oito expressões, zoom e cursor, mas não mede FPS no equipamento real. A passagem adicional do filtro deve ser avaliada visualmente nesse equipamento. A paleta aproxima a referência; o traço e a textura continuam sendo os do modelo original.

A segunda revisão usa as duas referências adicionais enviadas pelo usuário. O cabelo ficou menos rosado, com vermelho mais profundo, sombras castanhas e curva de luminosidade que preserva reflexos. A pele usa marfim com escala de luminosidade, substituindo o aumento aditivo que achatava os tons claros. As íris ficaram azul-violeta, o jaleco perdeu o clareamento extra e a gravata ficou vermelho-escura. Build e inspeções de quadros neutro/rubor passaram sem erros de navegador; nenhum movimento, expressão ou arquivo do modelo foi alterado nessa revisão.
