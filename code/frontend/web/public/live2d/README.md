# Recursos locais do Live2D

`amadeus/` recebe o modelo Kurisu escolhido, mantendo `Kurisu.model3.json` e suas referências internas. `runtime/` recebe os quatro scripts locais Pixi/Cubism.

`npm run dev` e `npm run build` executam `scripts/prepare-public.mjs` para copiar os arquivos já existentes em `code/frontend/assets/avatar/local`. Os binários e suas cópias são ignorados pelo Git. Não há download automático.

Origem e restauração: [README da interface](../../README.md).
