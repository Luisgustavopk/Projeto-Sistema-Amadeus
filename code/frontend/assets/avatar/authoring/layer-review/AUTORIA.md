# Pacote de recortes visíveis — poses aprovadas

Os desenhos e o contorno v5 foram aprovados. Os recortes aqui são a primeira preparação para autoria do rig, com 14 camadas por pose. Ainda precisam de revisão das divisões entre peças e pintura das áreas escondidas.

Abra `index.html` para inspecionar cada pose. Em **Camada selecionada**, a opção **Ampliar peça isolada** facilita conferir o limite do recorte. Em **Composição das camadas**, as 14 peças recompõem os pixels do desenho aprovado. **Mostrar articulações** exibe guias, não deformadores exportados.

Cada pasta de pose contém:

- `approved.png`: cópia exata do desenho aprovado.
- `visible-parts.psd`: PSD com as 14 partes visíveis.
- PNG por camada, sem reamostragem.
- `recomposed.png`: reconstrução validada contra o original.
- `layers.json`: posições dos recortes, pontos de articulação, hashes e áreas a completar.

Não mover as peças como se já fossem um rig pronto. Ainda faltam as partes do jaleco sob os braços e as mãos, extensões nas articulações e a gola sob o cabelo. A cabeça continua em conjunto, com rosto e olhos achatados; o controle facial deve ser reconstruído usando os desenhos originais.

Monte as malhas, deformadores e keyforms em um projeto Cubism após completar a arte oculta. A aplicação atual não carrega esses PSDs nem substitui o avatar por PNGs estáticos.
