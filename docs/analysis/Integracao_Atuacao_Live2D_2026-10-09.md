# Integração do catálogo de atuação no Live2D

Branch: `feat/interface`. A branch `feat/refinamento-llama` foi integrada no merge `713bdae`, preservando a interface React e incorporando o contrato ampliado de expressão. Os conflitos documentais foram resolvidos com as referências mais recentes; o `.gitignore` preserva as regras das duas branches.

## Resultado

- 177 expressões disponíveis: neutra, 49 emoções em três intensidades e 29 gestos faciais.
- 12 movimentos locais, executados pelo gerenciador nativo Cubism.
- Catálogo com busca, filtros, composição por emoção/intenção e intensidade, preservando os oito atalhos anteriores.
- Pose original `HandChange` recuperada em um controle separado. Uma troca de rosto não desfaz a mão no queixo.
- Camada de parâmetros com transições de 450 ms usando o relógio existente. Não cria ticker adicional nem acelera a animação ao selecionar expressões.
- Cursor cede prioridade a controles de cabeça/olhos durante a atuação, retomando o último alvo válido depois.
- Paleta atual, texturas, rig, física e modelo original preservados.

Os metadados visuais seguem as 50 emoções e 39 intenções do contrato do backend. Nem toda intenção exige um gesto próprio; quando há um acento, ele complementa a emoção sem substituir seus parâmetros. A intensidade escolhe três níveis discretos. A seleção manual e a composição funcionam localmente; não houve integração adicional de conversa, autenticação ou voz.

## Evidências

`npm test`: build e TypeScript aprovados, nove testes locais aprovados. Incluem cobertura do contrato, limites de parâmetros, curvas dos movimentos, não acumulação de valores, transições, retorno ao neutro e independência dos braços. Typecheck do backend integrado também passou.

`check:acting`: navegador Chrome headless, rig Cubism real, viewport inicial 1440 × 900 e celular 390 × 844. Percorreu as 177 seleções pelo painel; comparou parâmetros antes e depois da camada de atuação, verificou finitude/faixas reais e manteve `HandChange = 1` em todas. Executou os 12 movimentos com confirmação de aceitação pelo gerenciador nativo; testou tristeza + agradecimento sem introduzir sorriso, retorno ao neutro e retorno dos braços. Sem erros de página ou solicitações externas. Os hashes SHA-256 de `.moc3`, `.model3.json` e atlas ficaram iguais antes e depois.

Capturas locais em `.cache/acting-preview/`: raiva forte, vergonha forte, piscadela, olhos marejados, neutro e painel em desktop/celular. As capturas foram inspecionadas para conferir renderização, preservação do desenho e pose. São evidência técnica; não representam aprovação humana de fidelidade de todas as combinações.

`check:ui` cobre também os oito atalhos, falha/recuperação do carregamento, navegação, teclado, zoom repetido, ausência do ticker compartilhado e monitor opcional. A validação anterior e sua finalidade estão em `Interface_Live2D_2026-10-09.md`.

## Proveniência e manutenção

Especificações e orientações: `code/frontend/assets/avatar/acting/README.md`. O pacote de configurações fornecido pelo usuário foi adaptado para as faixas reais do rig e para a arquitetura atual. Referências a sprites/prints são marcadas como candidatas ilustrativas; o sprite `40000c` não comprova lágrimas nem sinal de raiva. Nenhuma imagem de sprite foi distribuída na interface.

O gerador escreve apenas `generated/`, exige o contrato do backend e valida IDs/faixas. A preparação pública acrescenta os arquivos de configuração à cópia local; as referências aos movimentos entram nas configurações do renderer em memória. Nenhum arquivo original do avatar é reescrito.

Não houve consumo de LLM, Cartesia ou outro serviço pago. A fluidez deve ser conferida no equipamento do usuário; as medições de execução acelerada em WebGL por software não são uma estimativa do FPS real em GPU.

## Correções após o feedback de 10/10/2026

A risada com balanço foi removida; seu lugar no catálogo passou a ser um gesto leve usando os controles físicos dos braços. A virada emburrada agora segura os olhos fechados durante o giro e alcança −28° na cabeça. A inclinação usa deformação de tronco/cabeça, piscadela e aproximação de 18%; é uma aproximação da referência enviada `1771593912520_image.png`, respeitando as capacidades do rig. A surpresa associa recuo, olhos/sobrancelhas erguidos e boca aberta.

As curvas de pose são derivadas da mesma especificação dos `.motion3.json` e aplicadas no fim da atualização dos parâmetros, depois da física e do piscar. A expressão escolhida cede os parâmetros controlados pelo movimento e retorna ao finalizar. A prévia silenciosa preserva a boca da reação; a demonstração de fala tem prioridade se estiver ativa. O enquadramento complementa a deformação do torso e compõe com o zoom, usando o mesmo relógio e sem modificar a textura.

Build e TypeScript aprovados; 11 testes locais passaram. Os testes adicionais verificam olhos fechados, prioridade de reação sobre uma expressão anterior, ausência de acúmulo, retorno da expressão, enquadramento e pose de mãos. `check:motions` executa os quatro movimentos ajustados no rig real, mede os parâmetros nos trechos principais e verifica retorno ao enquadramento inicial, cursor, ausência da risada removida e hashes do modelo intactos. Capturas em `.cache/motion-preview/` foram inspecionadas.

O modelo compilado contém `HandChange` para mão no queixo e seis controles físicos de braço/mão. Não contém controles que implementem braços cruzados, mão na cintura ou dedo apontando. Nem a pasta do modelo nem o arquivo `kurisu.tar.gz` fornecem `.cmo3`, `.can3` ou PSD. Essas três poses exigem preparar camadas/deformadores num projeto Cubism e exportar um novo rig; o gesto leve acrescentado não é apresentado como substituto dessas poses.
