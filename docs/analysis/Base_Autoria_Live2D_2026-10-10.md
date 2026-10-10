# Base de autoria do avatar — 10/10/2026

## Resultado e trabalho pendente

O usuário rejeitou o gesto leve dos braços e a inclinação aproximada. Ambos foram retirados do catálogo, arquivos gerados e cópia pública. Permanecem 177 expressões e 10 movimentos. Não foram substituídos por outra aproximação de escala ou deformação dos braços neutros.

O primeiro desenho gerado também foi rejeitado por mudar o traço e deixar a mão fora da cintura. Não foi incorporado ao projeto. A exigência passou a ser preservação do traço e detalhes do avatar original; na referência de inclinação, a mão fica na cintura.

Foi preparada uma base raster em camadas a partir dos desenhos existentes. Isso ajuda a começar a edição, mas **não conclui os desenhos novos nem o rig**.

## Base produzida

`code/frontend/assets/avatar/local/authoring-v1/`, ignorado pelo Git:

- `neutral/source-art.psd`: 78 camadas.
- `hand-on-chin/source-art.psd`: 79 camadas.
- PNGs por ArtMesh, composição nas cores originais, referência da paleta atual, nomes/ordem/coordenadas em `layers.json`.
- `index.html`: inspeção offline das composições e peças.
- `provenance.json`: hashes dos binários e limites da extração.

O exportador não usa geração de imagem: isola cada drawable através do próprio renderer, preservando seus pixels, máscaras e cor de origem. O PSD leva a composição original e camadas raster; não recupera malhas, deformadores ou keyforms. A extração é do estado visível selecionado, e não restaura áreas ocultas ou outras poses. A paleta anime é um shader da aplicação e fica como PNG de referência separado. Os binários originais continuam intactos.

`npm run avatar:export-base` regenera os arquivos em uma pasta fixa local. As artes privadas não são incorporadas aos commits.

## Origem confirmada

O usuário apontou [FrancescoCaracciolo/Amadeus](https://github.com/FrancescoCaracciolo/Amadeus#avatar). O ZIP atual indicado pelo README, `https://nyarchlinux.moe/Kurisu.zip`, possui SHA-256 `bd47f975a21b46e1755957aeede9b87d4e03baddbdc8f563eb3144b55b107051`, igual ao pacote já registrado no projeto. Possui 21 registros contando diretórios: exportado `.moc3`, atlas, `.cdi3.json`, física, cinco motions e oito expressões. Não contém PSD ou `.cmo3`/`.can3`.

Os ZIPs de sprites com e sem `(1)` também são idênticos, SHA-256 `aab968cf3f99210f89b54172f19c88def4973e713a5ea9ce55261471135bd448`. São 174 PNGs e créditos. A série `CRS_JLE` fornece referência desenhada de braços cruzados, sem camadas de autoria.

## Controles especificados

`code/frontend/assets/avatar/authoring/rig-blueprint.json` registra quatro poses: braços cruzados, mão na cintura, indicador levantado e inclinação com mão na cintura. Define peças faltantes, hierarquia e os controles propostos `ParamArmPose` e `ParamLeanForward`.

`rig-pose-contract.mjs` verifica a existência física e as faixas desses parâmetros. Não os aplica ao avatar atual nem aceita índices virtuais como se fossem controles reais. A montagem e exportação precisam ocorrer em um projeto Cubism editável. [Tipos de arquivo do Cubism](https://docs.live2d.com/en/cubism-editor-manual/file-type-and-extension/).

## Validação

- Build/TypeScript e 13 testes passaram.
- `check-motions.mjs`: dois movimentos restantes sob revisão, rejeitados ausentes, prioridade sobre cursor, retorno do enquadramento, zero erros ou chamadas externas, hashes originais inalterados.
- Leitor independente `psd-tools` em `.cache`: abriu os dois PSDs e conferiu os pixels das 157 camadas e das composições contra os PNGs exportados.
- Importação/edição no Cubism não executada; não há projeto de autoria ou Editor identificado localmente. Não declarar a base como novo modelo exportável.

## Próximo trabalho

Obter o projeto de autoria original, ou reconstruir um projeto Cubism a partir das peças originais. Desenhar mangas, mãos, gola/torso em perspectiva e áreas ocultas sem redesenhar a identidade da personagem. Revisar visualmente os desenhos antes de construir malhas e deformadores; depois exportar outro `.moc3` e integrar seus controles. A inclinação usa mão na cintura, com expressão facial separada da pose.
