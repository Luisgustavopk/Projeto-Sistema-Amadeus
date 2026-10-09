# Prévia local dos avatares

Compara os dois modelos Kurisu com controles de expressão, movimento, zoom, enquadramento e simulação de boca. Permite salvar a comparação em PNG. A simulação não usa áudio nem microfone.

O modelo novo foi escolhido pelo usuário para a integração futura; a escolha fica em [selection.json](../assets/avatar/selection.json). A prévia continua mostrando ambos para consulta.

## Executar

Com Node.js 24, nesta pasta:

```sh
npm run dev
```

Abrir <http://127.0.0.1:4175/>. Para outra porta, definir `AVATAR_PREVIEW_PORT` antes de iniciar. O servidor atende somente no loopback e não acessa a API de conversa, chaves, provedores ou banco.

## Arquivos locais necessários

Os pacotes e runtimes estão preservados em `../assets/avatar/local/`, ignorado pelo Git:

- `kurisu/kurisu.model.json` e seus arquivos referenciados;
- `modern/Kurisu/Kurisu.model3.json` e seus arquivos referenciados;
- `viewer-runtime/`: `pixi.min.js`, `live2d.min.js`, `live2dcubismcore.min.js` e `live2d-display.min.js`.

[runtime.manifest.json](runtime.manifest.json) registra URLs e SHA-256 dos runtimes obtidos. [kurisu-sources.manifest.json](../assets/avatar/kurisu-sources.manifest.json) registra origem, arquivos e hashes dos modelos. Em outra máquina, recuperar os arquivos dessas fontes e conferir os hashes antes de usar a prévia. Esses arquivos não são baixados ao abrir a página.

## Estado de validação

Sintaxe e entrega HTTP deste comparador foram verificadas. A inspeção dos dois candidatos neste comparador ficou pendente. Em 09/10/2026, o modelo novo foi renderizado e conferido na [interface web](../web/README.md), incluindo sete reações faciais e retorno à neutra; a validação posterior consta em [selection.json](../assets/avatar/selection.json). O manifesto de aquisição preserva o estado inicial da inspeção. O modelo antigo e todo o catálogo de movimentos continuam sem validação visual completa.

Este renderer é uma prévia independente. A integração dos eventos de expressão e do áudio real da conversa pertence à fase 5.
