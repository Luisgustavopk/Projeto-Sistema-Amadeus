# Avaliação conversacional v2

A avaliação anterior não aprova naturalidade nem fidelidade. Seus 18 casos continuam úteis como regressão, mas contêm entradas presentes nos exemplos do prompt. A rodada v2 separa desenvolvimento, teste reservado e regressão, mede respostas repetidas e conserva as evidências que chegaram ao modelo.

## Conjuntos e congelamento

Os recursos estão em `code/backend/evals/persona/quality-v2/`:

- `development.json`: seis conversas para desenvolver o protocolo e futuros ajustes.
- `heldout.json`: 36 conversas novas, 108 turnos, incluindo elogio, constrangimento, discordância, ciência, identidade digital, apelidos, planos adiados, recomendações, inglês, interrupção e iniciativa.
- `regression.json`: cópia congelada das 18 conversas anteriores. Seus resultados não representam generalização.
- `core-positive.md`: núcleo experimental de aproximadamente 2,1 mil caracteres, com orientações positivas.
- `turn-direction.md`: diretiva curta colocada ao final do sistema na variante compacta.
- `rubric.md`: oito critérios para um juiz de outra família de modelos.
- `manifest.json`: hashes dos conjuntos e recursos antes das chamadas remotas.

O executor recusa arquivos modificados depois do congelamento. Verifica coincidências literais com exemplos de desenvolvimento, núcleo atual, complementos de presença e diretriz administrativa. Essa busca detecta contaminação literal; não demonstra independência semântica absoluta. Quando um caso reservado é observado, ele não deve orientar alterações do prompt e depois servir novamente como evidência de generalização. Novas versões precisam de outro conjunto reservado.

## Comparação inicial

Atualização de 07/10/2026: o executor também prepara os braços `examples-0/2/4/6`, com Llama e núcleo atual iguais, variando apenas o teto de exemplos contextuais adicionais. O [protocolo do corpus](../architecture/Referencias_Contextuais_Persona.md#comparação-controlada-preparada) registra isolamento, quantidade efetiva, fontes e limitações. Esses braços foram preparados sem inferência paga na integração e executados depois, na [rodada 2](Resultados_Refinamento_Llama_Rodada_2.md); os resultados históricos abaixo não incluem o novo índice.

O foco vigente do refinamento é o **Llama 3.3 70B**, principal pago. O executor usa `--models=llama` por padrão; a comparação inicial entre autores permanece como registro histórico. Os modelos de reserva não recebem refinamento de atuação nesta etapa. Gemini continua como juiz independente do Llama: avaliar respostas não o promove a modelo principal nem valida suas próprias respostas.

Todas as variantes usam o processador de turnos real, sem STT, TTS ou análise remota Jev. Histórico, memória de exemplo e estado artístico são isolados do perfil real. O contexto administrativo vigente é lido, registrado localmente e mantido igual entre variantes.

`current` usa o núcleo e complemento de presença atuais. `compact` substitui somente esse núcleo, remove o complemento fixo de presença e acrescenta a diretiva final. Contratos de memória, formato de expressão, contexto, estado e direção de iniciativa continuam passando pelo processador. Ambas usam temperatura 0,6 e o mesmo limite de 512 tokens. Assim, este primeiro contraste mede o pacote de prompt; não isola cada edição nem testa ainda o governador de tamanho.

Modelos explícitos nesta rodada:

| Nome   | ID OpenRouter                       | Juiz independente |
| ------ | ----------------------------------- | ----------------- |
| Llama  | `meta-llama/llama-3.3-70b-instruct` | Gemini            |
| Gemini | `google/gemini-2.5-flash-lite`      | Qwen              |
| Qwen   | `qwen/qwen3-235b-a22b-2507`         | Gemini            |
| Kimi   | `moonshotai/kimi-k2.5`              | Gemini            |

O juiz recebe resposta, histórico, fatos e expectativa; não recebe modelo autor nem variante. A nota é provisória: independência entre modelos não garante concordância com o usuário. O juiz pode aprovar cordialidade de atendimento como naturalidade. Antes de escolher um modelo pelas notas, é necessária calibração humana e análise de falsos positivos. A comparação do Gemini usa um juiz diferente, outra limitação das taxas entre autores.

O executor roda entre cinco e dez amostras por conversa, com histórico novo por célula. A ordem das células gira entre amostras. O piloto já executado selecionou H01 e H02: duas conversas, cinco amostras, quatro modelos e duas variantes, totalizando até 240 turnos. Isso não valida os 36 cenários. Com o padrão vigente, preparar H01/H02 corresponde a 60 turnos do Llama; os 36 cenários completos corresponderiam a 1.080 turnos, mais julgamentos e possíveis reparos de formato. Os casos já observados permanecem diagnósticos, sem reutilização como teste reservado depois de ajustes orientados por suas falhas.

## Orçamento e dados

A primeira rodada tem autorização de **até US$ 0,25 no total**. O executor e o juiz compartilham o mesmo orçamento, inclusive entre comandos sucessivos. `data/refinement/quality-v2-budget.json` conserva o consumo contabilizado; um bloqueio de arquivo impede duas execuções concorrentes de gastar o teto separadamente.

Em 07/10/2026, o usuário autorizou uma segunda rodada com **novos US$ 0,25**, para [refinamento do Llama em etapas pequenas](Refinamento_Llama_Etapas_Pequenas.md). A primeira rodada, com US$ 0,2322949165 contabilizados, fica arquivada; não é apagada nem agregada ao consumo da rodada nova. O registro ativo identifica a rodada, e o teto continua compartilhado entre todos os comandos e o juiz. Abrir uma rodada nova não renova automaticamente orçamento em cada etapa, dia ou tentativa.

Os [resultados da rodada 2](Resultados_Refinamento_Llama_Rodada_2.md) registram 268/270 turnos concluídos e US$ 0,20724567 contabilizados. A calibração humana permanece em 0/30; as notas do juiz não aprovam persona. Os novos diagnósticos de memória e iniciativa têm manifesto próprio, sem alterar o conjunto reservado original.

Antes de cada pedido, reserva-se um limite conservador usando bytes UTF-8 da entrada, margem de formatação, saída máxima e preços máximos explícitos. Custos reportados reconciliam a reserva. Falhas ou custo ausente conservam a estimativa; não são devolvidos como se fossem gratuitos. Ao faltar margem, a cobertura fica incompleta e a rodada para. Não existem retentativas financeiras invisíveis; reparos feitos pelo processador são chamadas distintas e também reservam orçamento.

O catálogo é consultado antes da inferência. Os limites de preço desta avaliação são temporários e pertencem ao executor; não alteram a lista paga nem os limites ativos da produção. Parâmetros obrigatórios são exigidos na rota. Os provedores e parâmetros efetivos ficam no relatório. Chaves permanecem no ambiente e não fazem parte dos registros.

Relatórios, prompts finais, transcrições, ficha de calibração e consumo ficam somente em `code/backend/api/data/refinement/`, já ignorado pelo Git. As falas e fatos dos cenários são sintéticos. A avaliação não envia currículo, dados de redes sociais ou memórias reais do proprietário.

## Métricas e revisão

O JSON conserva cada entrada realmente enviada ao provedor, fatos fornecidos, cabeçalho bruto, expressão, chamadas de reparo, erros, uso, custo e provedor retornado. Para cada turno, distingue:

1. Primeiro conteúdo bruto: pode ser apenas o cabeçalho técnico.
2. Primeiro texto após o cabeçalho: ainda pode não formar um segmento reproduzível.
3. Primeiro `reply.text`: primeiro segmento utilizável pelo consumidor.
4. Tempo completo do processador, sem incluir o juiz.

Esses tempos não medem primeiro áudio, STT, recuperação real, playback ou VAD. Os modelos usam rotas exclusivas de avaliação, sem troca automática de modelo; uma rota lenta pode diferir do comportamento de produção com fallback.

Também são reportados palavras, frases, perguntas por turno, diversidade de aberturas, cópia de trechos e repetição entre falas. São diagnósticos de avaliação; não adicionam filtros de palavras à memória ou ao runtime. A referência de até 0,3 perguntas/turno é agregada e não torna toda pergunta contextual um defeito.

O juiz retorna interlocução, proporcionalidade, sustentação factual, continuidade, persona, perguntas, recomendações e cânone. Aprovações, falhas, indefinidos e não aplicáveis permanecem separados. Os intervalos de Wilson por turno são descritivos, pois os turnos da mesma conversa são correlacionados. Taxas também são agrupadas por cenário. Nenhuma taxa geral deve esconder a cobertura parcial ou a falta de calibração.

A ficha `*-calibration.json` contém até 30 turnos distribuídos entre células, com autor e variante ocultos e `humanChecks:null`. A versão `*-calibration.md` facilita a leitura e permite enviar a avaliação no chat usando o código de cada item. No JSON, edite somente `humanChecks` usando os oito critérios da rubrica, cada um com `applicable`, `pass` e `evidence`. Não aplicável usa `pass:null`. A ferramenta de calibração calcula concordância e falsas aprovações somente depois dessa revisão; não inventa rótulos humanos. Sumarizações posteriores preservam os rótulos humanos e a seleção congelada da ficha.

## Comandos

Na pasta `code/backend/api`:

```powershell
# Preparação sem consumo de API
npm run eval:conversation-quality -- --only=H01,H02

# Piloto pago, respeitando o orçamento compartilhado já consumido
npm run eval:conversation-quality -- --run --only=H01,H02

# Normalização local dos dois formatos de JSON do juiz; sem novas chamadas
node scripts/summarize-conversation-quality.mjs TIMESTAMP-quality-v2.json

# Depois de preencher a ficha humana; sem novas chamadas
npm run eval:conversation-quality:calibrate -- TIMESTAMP-quality-v2.json
```

O comando de sumarização aceita objeto ou lista identificada de critérios, valida completude e duplicações e não altera decisões do juiz. Falhas de schema permanecem indefinidas. Não use a sumarização durante a execução.

## Próximos experimentos

Depois da calibração, a ordem continua atuação, presença e estado, seguida de otimização com medições reais. As propostas seguintes ainda não estão ativadas na produção por este ensaio:

- Governador de saída proporcional e teste separado de penalidades/top-p por modelo.
- Poucos exemplos recuperados por situação, interesses variados e histórico de recomendações com metadados.
- Assuntos em aberto estruturados, distinção entre plano, adiamento e conclusão; iniciativa com tipo e âncora escolhidos pelo controlador.
- Comparação de fala sem cabeçalho com classificação paralela, preservando a sustentação factual antes de qualquer ativação.
- Intervalos de presença adaptativos, sinal ocioso e backchannels gravados; validação com uso real.
- Sessões de 30–50 turnos e acompanhamento entre dias, além de áudio, VAD e barge-in físicos.

Um modelo só deve mudar de posição diante de novos argumentos ou evidência, não por contar insistências. Fine-tuning/DPO continua opcional, posterior a essas etapas e fora desta autorização. O banco citado de 183 exemplos ainda precisa ser localizado; o executor não presume que esse conjunto já está disponível.
