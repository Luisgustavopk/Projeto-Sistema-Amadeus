# Catálogo de atuação da Kurisu

Adaptado do `kurisu-expressions.zip` fornecido pelo usuário, SHA-256 `a21477febb3eedf8c862715a736ef3bd89db63798ccc1a4a3418f657e2111fc5`.

São **177 expressões**: uma neutra, 49 emoções em três níveis (sutil, média e forte) e 29 gestos faciais; mais **12 movimentos**. O gerador confere as 50 emoções e as 39 intenções contra o contrato do backend integrado da branch `feat/refinamento-llama`. `ranges.json` registra os limites observados no modelo Cubism local, com mínimo, máximo e padrão para seus 72 parâmetros.

## Regenerar

De `code/frontend/web`, execute `npm run avatar:generate`. As especificações ficam em `generate.mjs`; a saída é sempre `generated/`. O comando não remove diretórios nem modifica o modelo original. Depois execute `npm test` e `npm run check:acting`.

O catálogo tipado `catalog.mjs` fornece o painel e a camada de atuação. Os `.exp3.json` também ficam disponíveis na cópia pública para uso em ferramentas Cubism. `prepare-public.mjs` copia apenas esses recursos para o modelo público. O grupo de movimentos `Amadeus` é acrescentado às configurações em memória pelo renderer; o `Kurisu.model3.json` original não é reescrito.

## Execução

`avatar-acting.mjs` aplica uma única camada depois de movimentos/física e antes da atualização do rig. A interpolação de 450 ms usa o relógio existente; não cria ticker, timer ou listener por expressão. Uma nova seleção parte do estado interpolado atual, libera os controles da expressão anterior e evita acumular deslocamentos. O neutro devolve o rosto à animação natural.

O controle **Mão no queixo / trocar braços** aplica `HandChange` independentemente do rosto. É a pose disponível no rig, não uma nova pose de braços cruzados. O olhar cede prioridade às expressões que controlam cabeça/olhos e aos movimentos, retomando o cursor depois. Os movimentos usam o gerenciador nativo Cubism.

Após o feedback de 10/10, as curvas dos movimentos também recebem prioridade no fim da atualização do rig, depois da física e do piscar. Isso impede que os controles físicos dos braços ou a expressão selecionada apaguem uma reação. A boca dos movimentos é preservada durante a prévia silenciosa; a demonstração de fala tem prioridade quando está ativa. As curvas derivadas no catálogo têm a mesma interpolação Bézier dos arquivos `.motion3.json` e usam o mesmo relógio do renderer.

| Movimento | Ajuste |
| --- | --- |
| Virar emburrada | Giro de cabeça até −28°, olhos fechados no trecho principal e expressão contrariada. |
| Inclinar para frente | Cabeça e tronco inclinados, piscadela e aproximação de 18% no enquadramento. Aproximação da referência, sem acrescentar um novo deformador. |
| Surpresa e recuo | Olhos e sobrancelhas erguidos, boca aberta, movimento de tronco e recuo de 10% no enquadramento. |
| Gesto leve dos braços | Usa os seis controles físicos existentes, com liberação temporária da mão no queixo e restauração da pose depois. |

A risada com balanço foi removida do catálogo e dos arquivos gerados/publicados. O enquadramento dos movimentos compõe com o zoom escolhido pelo usuário e volta ao valor anterior ao terminar. É aplicado antes da renderização, sem outro ticker.

Braços cruzados, mão na cintura e dedo apontando para cima **não estão implementados nesse rig**. O pacote local e `kurisu.tar.gz` não contêm o projeto `.cmo3` nem PSD editável. Para essas poses será necessário preparar as camadas e os deformadores correspondentes em um projeto Cubism e exportar outro `.moc3`; os sprites de referência não acrescentam essas capacidades ao binário atual.

`planActing()` seleciona um nível de emoção pela intensidade (`< 0,34`, `< 0,67`, demais) e, quando pertinente, um acento da intenção. O acento só acrescenta parâmetros que a emoção não controla; sorrisos de agradecimento não substituem tristeza, por exemplo. Intenções sem acento específico preservam a emoção. Os níveis são discretos: este catálogo não implementa um estado emocional persistente.

## Referências e limites

As referências a sprites e prints do pacote são **candidatas ilustrativas**, não comprovação de uma reação canônica. As descrições de lágrimas e do sinal de raiva associadas ao sprite `40000c` foram corrigidas: esse sprite não comprova esses detalhes. Os 174 sprites fornecidos foram examinados como referência; não são copiados para o frontend e não substituem texturas ou desenhos.

Nenhum `.moc3`, atlas, deformador, física ou recorte do avatar é alterado. As combinações exploram apenas controles já existentes. Algumas emoções podem parecer próximas por compartilharem o mesmo rig; a avaliação visual do usuário continua necessária. Não há geração de imagem, consumo de API, áudio ou seleção de LLM nesta integração.
