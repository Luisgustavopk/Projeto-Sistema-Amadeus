# Avatar

Modelo e rig Live2D pertencem à fase 5. Registrar origem e condições de uso dos assets selecionados.

## Candidatos Kurisu inspecionados — 06/10/2026

Dois modelos estão disponíveis localmente, fora do Git:

- `local/kurisu/kurisu.model.json`: pacote fornecido pelo usuário, formato Cubism 2.x.
- `local/modern/Kurisu/Kurisu.model3.json`: pacote mais novo indicado no README de FrancescoCaracciolo/Amadeus, formato Cubism 3+, oito expressões, cinco movimentos e parâmetros de piscar/lip-sync declarados. Escolhido pelo usuário para integração futura em 06/10/2026.

[kurisu-sources.manifest.json](kurisu-sources.manifest.json) registra origem, hashes, referências e parâmetros no momento da aquisição. Todos os arquivos referenciados existem. Não foi encontrada licença própria nem autoria nos pacotes; binários e originais permanecem locais.

A [análise de aquisição](../../../../docs/analysis/Referencias_Kurisu_Amadeus.md) descreve a compatibilidade e a atuação. Em 09/10/2026, o modelo novo foi integrado à [interface web](../../web/README.md) e sua renderização foi conferida em Chrome/WebGL, com sete reações faciais e retorno à expressão neutra. A integração é visual, ainda sem eventos da conversa ou áudio real.

A escolha e a validação posterior estão preservadas em [selection.json](selection.json), separadas do inventário gerado pelo preparador. A [prévia local](../../avatar-preview/README.md) permite comparar ambos os modelos. A validação atual não cobre o modelo antigo, a expressão de troca de braços, todos os movimentos ou a fidelidade canônica da atuação. [Relatório visual](../../../../docs/analysis/Interface_Live2D_2026-10-09.md).
