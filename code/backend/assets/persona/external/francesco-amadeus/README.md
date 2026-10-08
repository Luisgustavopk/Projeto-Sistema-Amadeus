# Referência externa: FrancescoCaracciolo/Amadeus

Material obtido em 06/10/2026 por solicitação do usuário. [Repositório de origem](https://github.com/FrancescoCaracciolo/Amadeus), revisão fixada `9d4726bd37dce9919af37904e442e49205f329b8`. O [manifesto](manifest.json) registra arquivos, tamanhos, SHA-256 e hashes dos blobs Git conferidos no download.

## Conteúdo local

- `source/`: snapshot integral dos 15 arquivos do repositório, incluindo licença GPL-3.0, README, diálogos, e-mails, prompt, resumo da história, extensão Python e referências de voz.
- `prepared/dialogues.jsonl`: 758 falas não vazias atribuídas a Kurisu, com até três intervenções anteriores e uma posterior, autoria, linhas e segmentos do arquivo. São candidatos de estilo; 733 textos são distintos. Não são 758 cenas ou pares de treinamento aprovados.
- `prepared/story.jsonl`: 40 trechos do resumo em 17 seções, com título e offsets no texto original. É fonte secundária, não roteiro oficial verificado.
- `prepared/emails.jsonl`: 74 mensagens preservadas; 64 não informam remetente. Destinatário e apelido não comprovam autoria.
- [Direção de curadoria em pt-BR](curadoria.pt-BR.md): análise de aproveitamento, exemplos novos de produto e limites de interpretação.

`source/` e `prepared/` permanecem locais e ignorados pelo Git. O código da aplicação não importa a extensão Python nem o prompt externo como instruções. Não houve tradução integral, fine-tuning ou indexação vetorial desse corpus.

Na persona **0.4.16**, a [compilação de atuação em pt-BR](../../canon-conversation-v1.md) entra no prompt vocal, na recuperação e na comparação. Ela combina as fontes existentes com funções de reação observadas no corpus e exemplos originais. A história ajuda a situar as cenas e delimitar cronologia; não se torna memória do usuário nem vivência da personagem. Não carregamos todas as falas inglesas em cada turno. A recuperação semântica de cenas/lore permanece uma proposta separada, ainda não implementada.

## Reproduzir a preparação

Atualização de 07/10/2026: o [catálogo contextual](../../corpus-examples-v1.md) contém 33 adaptações de atuação e seis resumos de lore rastreáveis. O corpus preparado bruto continua como matéria-prima, com 40 trechos de história arquivados separadamente no SQLite e excluídos do prompt. A [integração contextual](../../../../../../docs/architecture/Referencias_Contextuais_Persona.md) implementa seleção BGE/Jina, orçamento configurável e mensagens de demonstração no fluxo vocal. A [avaliação textual da rodada 2](../../../../../../docs/analysis/Resultados_Refinamento_Llama_Rodada_2.md) não aprovou naturalidade e fidelidade. A proposta de recuperação mencionada acima registra o estado anterior à implementação.

O preparador e sua integração com os assets de avatar estão preservados na branch `feat/interface`, onde a aquisição foi realizada. Nessa branch, na pasta `code/backend/api`:

```sh
npm run prepare:kurisu-reference
npm run test:kurisu-reference
```

O preparador exige o snapshot local e os dois pacotes de avatar inspecionados. Confere a revisão e os blobs Git, produz JSONL e manifestos, valida referências dos modelos e dimensões PNG. Não baixa arquivos, carrega SDK Live2D ou acessa o banco da produção. Falha se alguma fonte não corresponder à revisão fixada.

Para recuperar o snapshot em outra máquina, baixar os arquivos listados no manifesto de `https://raw.githubusercontent.com/FrancescoCaracciolo/Amadeus/9d4726bd37dce9919af37904e442e49205f329b8/`, preservando os caminhos em `source/`; também salvar a árvore da API GitHub para essa revisão como `source/github-tree.json`. Os pacotes de avatar e seus hashes estão no manifesto do frontend da branch `feat/interface`.

## Procedência e distribuição

A licença declarada do repositório está preservada em `source/LICENSE`. Ela não foi aplicada automaticamente ao código original deste projeto. Os diálogos, a história, a interpretação vocal e os avatares têm procedências distintas; a disponibilidade no GitHub não comprova autorização dos titulares da obra e dos assets para toda utilização ou redistribuição. Não foi encontrada licença própria nem autor nos pacotes de avatar. Por isso, o snapshot e os binários foram guardados como referências locais, acompanhados de inventário, sem publicação nesta etapa.

A análise completa e a proposta de integração estão em [Referencias_Kurisu_Amadeus.md](../../../../../../docs/analysis/Referencias_Kurisu_Amadeus.md).
