# Biblioteca das poses para autoria no Cubism

`pose-library.psd` reúne as quatro poses aprovadas em quatro pastas, com 14 peças por pose. O canvas é 1000 × 1800, igual à base original extraída. As imagens mantêm seus pixels e coordenadas originais; o espaço adicional do canvas é transparente. **Não foram alinhadas, reamostradas nem recompostas sobre o rosto original.** O registro de tamanho e articulações de cada pose fica em `import-manifest.json`.

A pasta `hand-on-hip` está visível inicialmente. As outras três estão ocultas. Os nomes das peças têm prefixo da pose para permanecerem únicos em uma importação conjunta. A montagem e a importação no Editor ainda precisam ser verificadas; este PSD não contém malhas, deformadores nem keyforms.

O pacote também contém `original-neutral.psd` (78 peças) e `original-hand-on-chin.psd` (79 peças), remontados a partir dos recortes originais, com ordem de desenho corrigida. Nenhum recorte original é pintado ou reamostrado. São fotografias por ArtMesh do modelo exportado, com máscaras já aplicadas, **não o PSD original de autoria recuperado**. Estão nas cores de origem; os PNGs `*-palette-reference.png` mostram a paleta atual como referência separada. Reconstruir o rosto exige reparar as áreas ocultas, máscaras e keyforms que essa extração não recuperou.

## Importação de verificação

1. No Cubism, abra `pose-library.psd` em **File → Open**. Escolha **Create new model from PSD file** para criar um documento separado, sem substituir o modelo em uso.
2. Confira as quatro pastas e as 56 peças. Pastas ocultas também devem ser importadas, conforme o [manual oficial](https://docs.live2d.com/en/cubism-editor-manual/psd-import/). Exiba uma pose por vez para comparar com a galeria aprovada. Confira também o alfa em fundos claro e escuro.
3. Salve o documento preliminar como `pose-library-draft.cmo3` nesta pasta local. Apenas importar gera malhas mínimas; isso ainda não valida movimento.
4. Registre a versão do Editor e qualquer incompatibilidade de leitura antes de seguir para autoria.

## Autoria ainda necessária

- Refinar os recortes e desenhar as áreas ocultas de tronco, gola, mangas e articulações em camadas separadas. Preservar o desenho aprovado como referência.
- Registrar cada pose em relação à base original, usando pescoço, ombros e mãos. Igualar o tamanho do canvas não iguala a escala anatômica nem a perspectiva.
- Reconstruir os controles de olhos, pálpebras, sobrancelhas, boca e rosto com as peças originais. As cabeças das quatro poses ainda são conjuntos achatados.
- Montar a hierarquia de deformadores e os parâmetros de `rig-blueprint.json`. `ParamArmPose` escolhe os desenhos dos braços; `ParamLeanForward` controla a perspectiva. As variantes não devem ficar simultaneamente opacas nem criar transparência durante a troca.
- Revisar cada entrada, permanência e saída. Exportar MOC3, atlas e model3 para uma pasta nova somente depois dessa revisão. A versão de exportação deve ser compatível com o Core usado pela interface.

## Estado em 10/10/2026

O usuário informou ter ativado o teste do Cubism Pro. A instalação `C:\Program Files\Live2D Cubism 5.3` foi encontrada. A ferramenta de controle de aplicativos falhou ao iniciar seu runtime Node, mesmo após reset, com `O sistema não pode encontrar o caminho especificado (os error 3)`. Portanto, a licença ativa não foi inspecionada pela UI, o PSD não foi importado nesta sessão e nenhum projeto CMO3/MOC3 foi criado. O usuário concordou em reiniciar o aplicativo do Codex e deixar o Cubism aberto para retomar.
