# Base para novos desenhos e rig

Os commits `2ccfd40`, `a53a9d8` e `dd54a38` registram o catálogo anterior, a integração e os testes. A inclinação e o gesto leve dos braços foram rejeitados visualmente pelo usuário e retirados do catálogo ativo. Passar nos testes de parâmetros não significou reproduzir a referência.

A primeira ilustração gerada também foi rejeitada: mudou o traço e não colocou a mão na cintura. Ela **não foi incorporada** ao projeto. Não será usada para substituir o rosto, cabelo ou corpo original.

## Arquivos locais

Execute `npm run avatar:export-base` em `code/frontend/web`. O exportador usa o renderer e os desenhos do modelo local para criar `../assets/avatar/local/authoring-v1/`, ignorado pelo Git:

- `neutral/source-art.psd`: camadas raster da pose original.
- `hand-on-chin/source-art.psd`: camadas da pose alternativa já existente.
- Em cada pasta: PNG por ArtMesh, `layers.json`, composição original e referência da paleta atual.
- `provenance.json`: hashes das fontes e limites da extração.

Os PSDs são **bases de redesenho**, não o projeto PSD original recuperado. Cada camada é uma fotografia raster de um ArtMesh no estado escolhido, com as máscaras do renderer aplicadas. Não contêm os deformadores, malhas editáveis, keyforms, desenho oculto de outras posições nem áreas que faltam sob articulações. O exportador preserva as cores das texturas; a paleta anime aplicada por shader fica em um PNG de referência separado.

Não recolorir ou redesenhar o rosto para criar a pose. Reutilizar as peças originais e desenhar somente as mangas, mãos e perspectivas que faltam, comparando o traço, a espessura de contorno e o sombreamento. A mão fica na cintura na inclinação solicitada. Cabeça inclinada, piscadela e sorriso continuam sendo controles faciais independentes.

## Sprites fornecidos

Os dois ZIPs, com e sem `(1)` no nome, são idênticos: SHA-256 `aab968cf3f99210f89b54172f19c88def4973e713a5ea9ce55261471135bd448`. São 174 PNGs e `CREDITS.txt`, com crédito a Adrot, Davixxa, Nimms e DrDaxxy. A série `CRS_JLE` mostra braços cruzados e ajuda a conferir a construção do gesto. Não há PSD, projeto Cubism ou camadas nesses arquivos. Seu cabelo laranja não deve substituir a paleta atual.

## Controle proposto

`rig-blueprint.json` descreve as peças, a hierarquia e os dois parâmetros novos. É uma especificação de autoria; `runtimeEnabled` permanece `false` porque esses parâmetros **não existem** no modelo compilado atual.

`ParamArmPose` troca entre desenhos de braços, não força a manga neutra a virar mão na cintura. `ParamLeanForward` precisa de keyforms com perspectiva construída no desenho. Zoom e rotação lateral não substituem essa perspectiva.

O controlador `rig-pose-contract.mjs` valida os parâmetros físicos do modelo antes de aceitar uma pose. Não usa índices virtuais do Cubism para fingir um parâmetro ausente. A integração no renderer só deve ocorrer depois da exportação e revisão do novo rig.

Foram produzidos quatro desenhos: braços cruzados, mão na cintura, indicador levantado e inclinação para frente com mão na cintura. O usuário aprovou seu aspecto geral e solicitou somente corrigir a linha exterior do cabelo nas duas poses com mão na cintura. São PNGs transparentes e achatados; a aprovação visual não transforma os desenhos em peças prontas para rig nem em cópias dos pixels originais do modelo.

Os arquivos ficam em `../local/pose-candidates-v1/`. Execute `npm run avatar:review-poses` em `code/frontend/web` e abra o `index.html` dessa pasta para comparar cada candidato com o render original, conferir rosto/cabelo em detalhe e exportar notas de revisão. Não é preciso iniciar o backend. O manifesto `pose-candidates-v1.json` registra hashes, áreas visíveis e limitações; os prompts estão em `pose-prompts-v1.json`, produzidos com o imagegen integrado. A galeria somente enquadra imagens, sem modificar os PNGs, e os hashes do MOC3, model3 e atlas originais são conferidos ao prepará-la.

A revisão do contorno foi feita por **edição local de pixels**, autorizada explicitamente pelo usuário, após uma tentativa com imagegen alterar o enquadramento e outros detalhes. Essa tentativa foi descartada. `hand-on-hip-v2.png` e `lean-forward-v2.png` reforçam uma linha castanho-escura de aproximadamente 2 pixels na curva superior direita do cabelo. Mantêm dimensões, posição, silhueta, rosto, roupa, pose e todo o canal alfa das versões v1. Somente 556 e 959 pixels RGB da borda foram ajustados, respectivamente. Os PNGs v1 permanecem intactos; a galeria oferece **Antes do contorno** para comparação.

`hair-contour-v2.json` registra região, cor e espessura dessa primeira correção. `npm run avatar:refine-contours -- 2` reproduz os PNGs v2 sem reamostragem, conversão de cor ou alteração de alfa; `contour-provenance-v2.json`, na pasta local, registra hashes e verificações.

O usuário considerou v2 insuficiente, principalmente na inclinação. A revisão **v3** segue a silhueta conectada do cabelo, reforça uma linha escura contínua de 3,5 pixels na mão na cintura e 4 pixels na inclinação e remove a franja avermelhada semitransparente. O alfa é ajustado somente na borda; nenhum pixel antes totalmente transparente ganha desenho. O script não reamostra nem converte cores. Rosto, fios internos, roupa e pose permanecem intactos. São 7.639 e 9.361 pixels alterados em relação a v2, respectivamente, incluindo 3.725 e 3.657 ajustes de alfa. As versões v1 e v2 permanecem intactas.

`hair-contour-v3.json` registra os parâmetros, fontes e hashes. `npm run avatar:refine-contours -- 3` reproduz v3 e gera `contour-provenance-v3.json` na pasta local. O script recusa fontes alteradas e saídas existentes diferentes. A leitura independente com Pillow confirmou dimensões, pixels fora da região e interior opaco preservados, além de nenhuma expansão para pixels transparentes.

O usuário considerou v3 mais limpa, mas com contorno diferente do avatar original. A revisão **v4** parte novamente das imagens v1, evitando acumular a faixa escura de v3. A amostragem do render original mostra uma linha castanho-escura de aproximadamente 1–2 pixels com alfa gradual. O ajuste usa cor `[44, 20, 16]` com mesclagem de 85%, espessuras de 1,7 e 2,3 pixels proporcionais ao tamanho das cabeças e **não aumenta a opacidade**. Preserva a transparência da borda próxima e limpa apenas a franja externa mais afastada. O restante do desenho permanece intacto. São 4.448 e 5.060 pixels alterados em relação a v1, respectivamente; o alfa diminui em 2.916 e 2.752 pixels da franja externa. As versões anteriores permanecem disponíveis.

`npm run avatar:refine-contours -- 4` reproduz v4, com especificação em `hair-contour-v4.json` e relatório local `contour-provenance-v4.json`. Também confere o hash do render usado como referência. A galeria oferece **Contorno em detalhe**, com recortes de proporção equivalente para comparar as cabeças em escala semelhante.

V4 foi rejeitada por regressão: afinar a linha sobreposta tornou aparente o segundo traço presente nos desenhos. A revisão **v5** muda o método. Constrói segmentos subpixel da silhueta a partir do alfa e amostra diretamente o perfil RGBA do contorno do render original, adaptando-o à borda existente de cada pose. Substitui apenas uma faixa de até 6 pixels na mão na cintura e 8,46 pixels na inclinação, com mesclagem na junção interna. Não sobrepõe outra linha uniforme. O alfa é suavizado somente na borda próxima e a franja externa dispersa é removida. Nenhum pixel originalmente transparente ganha desenho. São 9.873 e 12.530 pixels ajustados em relação a v1, incluindo 5.699 e 6.583 ajustes de alfa. Rosto, roupa e interior do cabelo ficam intactos; o formato da cabeça não é refeito.

`npm run avatar:refine-contours` reproduz **v5** por padrão, usando `hair-contour-v5.json`, `reference-hair-outline.mjs` e o render original com hash conferido. O relatório local é `contour-provenance-v5.json`. Depois execute `npm run avatar:review-poses`; **Antes do contorno** mostra v4 → v5 e a legenda identifica a versão do PNG. As versões anteriores permanecem disponíveis. Amostrar o contorno original aproxima o traço, mas não implica identidade exata entre desenhos de poses distintas.

Ainda falta completar as peças com áreas ocultas, preservar os controles faciais, construir as malhas/deformadores e exportar o modelo. Não há `.cmo3` ou PSD original; será necessário obter o projeto de autoria ou montar outro a partir dessa base. `runtimeEnabled` continua `false`.

## Separação das poses aprovadas

O usuário aprovou v5 em 10/10/2026. O manifesto registra essa aprovação **somente dos desenhos**. `npm run avatar:prepare-layers`, em `code/frontend/web`, cria `../assets/avatar/local/pose-layers-v1/`, com quatro PSDs de **14 camadas visíveis por pose**, PNGs de cada peça, pontos de articulação, relatório de integridade e galeria offline. Os arquivos de desenho aprovados são lidos com SHA-256 conferido e não são sobrescritos.

`pose-layer-selections-v1.json` contém seleções por polígonos, refinadas por cor nas mãos, pescoço, gravata e mechas. São recortes iniciais para autoria, não uma separação anatômica final aprovada. Cada pixel pertence a uma única camada; partes não selecionadas continuam na base do tronco. O exportador verifica a recomposição completa, inclusive RGB e alfa, contra o PNG aprovado. O leitor independente `psd-tools` confirmou os dados brutos das 56 camadas, sem conversão de perfil ICC, e a reconstrução exata dos desenhos. A prévia achatada do PSD usa RGB sobre branco com alfa, conforme o formato de transparência do PSD; sua quantização de 8 bits não altera os dados das camadas. O leitor confirmou a aparência dessa prévia dentro de 1,5 níveis de canal no fundo branco.

A galeria em `pose-layers-v1/index.html` permite escolher uma pose, isolar/ampliar camadas, ocultar peças, ver os pontos de articulação e abrir o PSD correspondente. O navegador foi verificado nas quatro poses e em tamanho de celular. A legenda explicita as áreas ocultas pendentes; não simula uma animação que esconderia os vazios dos recortes.

Próximas operações de autoria:

1. Refinar os limites dos recortes de punhos, dedos, gola, mangas e mechas, conferindo a peça isolada e a composição.
2. Completar o tronco sob os antebraços cruzados e a mão na cintura; desenhar extensões de ombros, cotovelos, punhos e gola. Manter os pixels visíveis aprovados numa referência bloqueada e pintar apenas as novas áreas ocultas em camadas próprias.
3. Separar/reconstruir olhos, pálpebras, sobrancelhas, boca, rosto e cabelo a partir das peças originais. A camada de cabeça preservada ainda é um conjunto achatado, portanto não possui blinking ou lipsync independente.
4. Importar os PSDs completos em um novo projeto Cubism, montar ArtMeshes, máscaras, deformadores e keyforms do `rig-blueprint.json` e gerar as transições.
5. Exportar o modelo para uma pasta nova e validar os parâmetros reais, aparência e transições antes de ativá-lo na interface.

A [API externa documentada do Cubism](https://docs.live2d.com/en/cubism-editor-manual/external-application-integration-api-list/) permite consultar/alterar valores de parâmetros e receber notificações de exportação; a lista consultada não fornece operações para criar ArtMeshes, deformadores ou um novo rig. Portanto, não é uma alternativa de compilação dos PSDs por Node.js. A montagem e a [exportação para MOC3](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/) continuam pendentes no Editor. Nenhum novo CMO3/MOC3 foi produzido nesta etapa.

## Biblioteca de importação e Cubism Pro

Depois de o usuário informar a ativação do teste Pro, a instalação `C:\Program Files\Live2D Cubism 5.3` foi encontrada. O controle do Editor está bloqueado pelo runtime da ferramenta de automação: `failed to start Node runtime: O sistema não pode encontrar o caminho especificado (os error 3)`, inclusive após reset e nova tentativa. A licença ativa ainda não foi conferida pela UI. O usuário concordou em reiniciar o Codex e deixar o Cubism aberto; a nova tentativa também falhou.

`npm run avatar:prepare-library` reúne os recortes já preparados em `../local/cubism-import-v1/pose-library.psd`, com quatro pastas, 56 peças e nomes únicos. Mantém os pixels em suas coordenadas originais e somente amplia o canvas com espaço transparente até 1000 × 1800. Exibe apenas mão na cintura ao abrir; as demais pastas ficam ocultas. Não alinha anatomia nem aplica escalas para fingir transições prontas. Inclui duas bases PSD originais com a ordem de desenho corrigida, preservando os recortes e as cores de origem. O escritor PSD passa a preservar a ordem de entrada de trás para frente e suporta delimitadores de pastas e visibilidade.

O leitor independente confirmou a hierarquia das quatro pastas, os 56 recortes e a pose visível. A conferência no Cubism ainda está pendente. [CUBISM-IMPORTAR.md](CUBISM-IMPORTAR.md) descreve os arquivos, a importação de verificação e o trabalho de autoria restante. Os PSDs são materiais de importação; não constituem um projeto editável CMO3 nem um MOC3 exportado.

O usuário informou a origem: [FrancescoCaracciolo/Amadeus](https://github.com/FrancescoCaracciolo/Amadeus#avatar). O `Kurisu.zip` apontado pelo README foi baixado e conferido em 10/10/2026: SHA-256 `bd47f975a21b46e1755957aeede9b87d4e03baddbdc8f563eb3144b55b107051`, igual ao manifesto já existente. Seus 21 registros, incluindo diretórios, não contêm `.cmo3`, `.can3` ou PSD. O pacote antigo `kurisu.tar.gz` também não contém esses projetos. O link do repositório fornece o avatar exportado, não resolve a ausência da autoria editável.

O fluxo de PSD → modelo editável → exportação é descrito no [manual de importação de PSD](https://docs.live2d.com/en/cubism-editor-manual/psd-import/) e no [manual de tipos de arquivo](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/).
