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

Ainda falta produzir e aprovar os desenhos novos, separar suas peças, construir as malhas/deformadores e exportar o modelo. Não há `.cmo3`, PSD original ou Cubism Editor disponível na instalação local inspecionada; será necessário obter o projeto de autoria ou montar outro a partir dessa base.

O usuário informou a origem: [FrancescoCaracciolo/Amadeus](https://github.com/FrancescoCaracciolo/Amadeus#avatar). O `Kurisu.zip` apontado pelo README foi baixado e conferido em 10/10/2026: SHA-256 `bd47f975a21b46e1755957aeede9b87d4e03baddbdc8f563eb3144b55b107051`, igual ao manifesto já existente. Seus 21 registros, incluindo diretórios, não contêm `.cmo3`, `.can3` ou PSD. O pacote antigo `kurisu.tar.gz` também não contém esses projetos. O link do repositório fornece o avatar exportado, não resolve a ausência da autoria editável.

O fluxo de PSD → modelo editável → exportação é descrito no [manual de importação de PSD](https://docs.live2d.com/en/cubism-editor-manual/psd-import/) e no [manual de tipos de arquivo](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/).
