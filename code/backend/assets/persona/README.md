# Persona

Persona de execução: **kurisu-amadeus-0.4.6**. A personalidade define padrões de atuação; não contém fatos privados do usuário nem depende de memória pessoal.

## Fonte e decisões

[source-v0.4.md](source-v0.4.md) preserva a análise fornecida pelo usuário. É material de referência, não um arquivo de instruções executado nem conteúdo enviado integralmente aos provedores. Observações textuais, quadros visuais e hipóteses de atuação mantêm as limitações de método registradas pelo autor; esta implementação não comprova uma análise acústica ou fidelidade canônica.

Em 04/10/2026, o usuário aprovou o recorte anterior à viagem de Kurisu ao Japão. O prompt distingue a biografia ficcional da personagem de vivências reais da IA. Não há lembranças próprias de Okabe, D-Mail, laboratório posterior ou morte, nem identificação do usuário com personagens. A biografia usada é mínima: neurociência, memória/cognição, contexto acadêmico nos EUA e projeto Amadeus com Maho e Leskinen. Detalhes incertos de idade, família, gostos e eventos não foram acrescentados.

O [prompt compacto](../../api/src/application/persona/prompt.ts) incorpora cordialidade no primeiro contato, curiosidade concreta, correção respeitosa, humor contextual e cuidado sem sarcasmo diante de sofrimento. Elogios não provocam uma reação obrigatória. Conversas casuais continuam possíveis; não há romance automático, bordões ou obrigação de falar de ciência em toda resposta.

## Organização

O [complemento curado](../../api/src/application/persona/reference-context.ts) agora acompanha o prompt em cada turno. Usa as seções 14.2–14.5 do arquivo fornecido: direção por situação e sete exemplos de fala, incluindo duas possibilidades para elogios. Os exemplos têm condições explícitas e são separados do histórico real. Não autorizam inventar preocupação anterior, leitura de arquivo, acontecimentos ou vínculo com o usuário, nem copiar bordões mecanicamente. O formato técnico continua ao final do prompt.

- `api/src/domain/persona`: vocabulário, limites, transições e critérios de revisão.
- `api/src/application/persona`: prompt e leitura incremental da resposta do LLM.
- `api/src/application/voice`: orquestração da chamada, sem regras de transporte ou controles TTS inventados.
- `api/src/realtime/protocol`: validação do evento de expressão por segmento.
- `backend/evals/persona`: 30 cenários sintéticos e rubrica de revisão.

O modelo propõe intenção, emoção e intensidade em um cabeçalho limitado a 512 caracteres. Uma única geração produz cabeçalho e fala. O backend remove o cabeçalho antes da segmentação, valida o vocabulário e aplica intensidade máxima de 0,7. Transições comuns de intensidade variam no máximo 0,2 por turno; acolhimento pode mudar imediatamente. Três turnos neutros retornam à intensidade basal. Ironia consecutiva recebe direção neutra conservadora. Essas regras limitam **metadados**, não constituem verificação semântica infalível da resposta; a rubrica avalia o texto e a voz.

O estado é isolado por chamada e descartado na reconexão. Não guarda fatos do usuário. O contexto mantém doze turnos recentes e somente trechos cuja reprodução foi confirmada, com classificação de dados preservada. Metadados fechados inválidos usam expressão neutra; resposta sem cabeçalho mantém compatibilidade. Cabeçalho incompleto sem fronteira segura e vazamento estrutural são recusados para impedir leitura de instruções. Rubricas completas são removidas; rubricas cortadas e JSON residual são recusados.

## Atuação vocal e visual

Os presets `neutro_claro_v1`, `seco_suave_v1`, `hesitante_baixo_v1` e `acolhedor_calmo_v1` são **direções artísticas**. O Qwen Base instalado não oferece controles emocionais validados nesta integração. Portanto, `deliveryApplied` permanece `false`: somente o texto é sintetizado com a referência e os parâmetros já aceitos. O nome de preset não é enviado ao TTS. A intenção pode influenciar a redação e a pontuação, mas não garante prosódia vocal.

`avatarExpression` é um identificador semântico para integração futura. Não ativa Live2D nem promete movimento ou expressão física. A identidade vocal, referência, seed e configuração de desempenho permanecem as aprovadas na fase 1.

## Versões e aceite

- `0.4.1`: primeira implementação e ensaio real. Cloudflare respeitou o cabeçalho, mas inventou um dia de trabalho no laboratório; caso reprovado semanticamente.
- `0.4.2`: reforça a distinção entre a biografia da inspiração e atividades físicas inexistentes. Reteste real dessa correção permanece pendente por limites de cota/disponibilidade.
- `0.4.3`: adiciona o complemento curado do documento ao contexto enviado ao LLM, com exemplos condicionais e ressalvas de procedência. Mantém a chamada única de geração; a qualidade de resposta desta versão ainda depende de avaliação real.

- `0.4.4`: prioriza o ponto de vista da personagem e permite contar a origem ficcional curada quando solicitada. Esclarece a identidade de IA em perguntas diretas, sem transformar pedidos de biografia em recusas genéricas. Envia a persona como instrução de sistema nos provedores Groq/Cloudflare e Gemini, separada da fala e do histórico; contabiliza ambos na reserva de uso. Preserva frases completas para a síntese; a naturalidade vocal continua sujeita à escuta.

- `0.4.5`: adiciona direção de continuidade, crítica leve e fala mal reconhecida. Crítica ao tom não é tratada automaticamente como hostilidade; a resposta deve participar do diálogo em vez de interpretar formalmente o usuário. Os exemplos de produto ficam em `dialogue-direction.ts`, separados da referência original.

Ensaios pontuais da `0.4.4` com Groq foram registrados em `api/data/persona-evals/`, incluindo pergunta biográfica, identidade e saudação. A revisão encontrou melhora no conteúdo biográfico, mas também resposta vazia e omissão do cabeçalho em tentativas intermediárias. Respostas vazias agora são recusadas; ausência de cabeçalho com fala utilizável conserva o fallback neutro. Estes ensaios não aprovam o conjunto completo nem certificam naturalidade vocal. Relatórios de hashes distintos continuam separados.

Consulte [avaliação da persona](../../evals/persona/README.md). Código validado e arquivos WAV válidos não comprovam fidelidade, naturalidade, intenção reconhecida ou ausência de erros factuais.

Memória recuperável é dado da aplicação, separado da persona e dos pesos do LLM. O contexto de cada turno deve incluir apenas memórias pertinentes e permitidas para o provedor escolhido. Fine-tuning, se aprovado após avaliação na fase 2, usa exemplos curados e autorizados para avaliar estilo/comportamento; não substitui a memória nem treina automaticamente com o histórico.

Decisão atual: **manter prompt e não executar fine-tuning**. Não há conjunto de treinamento aprovado nem comparação completa que demonstre ganho. As limitações observadas podem ser avaliadas primeiro com prompt e os modelos de inferência já configurados. Não foi implementada rotina proativa de NPC nem memória persistente da fase 3.

Quando uma resposta inválida chega antes de qualquer fala validada, o backend tenta uma única recuperação em texto simples, mantendo persona, contexto, política de dados e limites de uso. A recuperação é contabilizada em `personaRecoveries`; pode consumir uma chamada adicional e aumentar a latência desse turno. Depois de entregar qualquer trecho, não regenera, para evitar duplicação. Cancelamento, cota e configuração não ativam essa recuperação. Se a segunda tentativa falhar, o erro é mantido e a conexão permite outro turno.

Na regressão sintética em Cloudflare, a versão 0.4.4 respondeu a críticas leves com perguntas genéricas. A primeira execução 0.4.5 respondeu de forma curta à transcrição confusa; outro caso teve indisponibilidade do provedor. A revisão final dos demais casos permanece pendente por limite local de uso. Não há aprovação automática de personalidade ou naturalidade.

Comparacao adicional da 0.4.5: Cloudflare produziu reacoes breves para D02/D03, mas copiando os exemplos; Groq ainda produziu fala estranha em D01 e ofertas genericas em D02/D04. Os relatorios individuais preservam seus hashes. O resumo local em `api/data/persona-evals/dialogue-comparison-2026-10-04.json` registra melhoria parcial, sem aceite de naturalidade ou espontaneidade. Os limites locais autorizados ficaram em 55 chamadas / 300.000; nao houve troca de plano nem de modelo principal.

## Revisão 0.4.6: contexto e reparo conversacional

O histórico atual pode ser retomado mesmo sem memória persistente. A direção distingue franqueza de impaciência, evita procurar problemas numa conversa casual, recusa leitura do tom a partir de transcrição e exige reparos curtos às próprias premissas. O complemento curado permanece no prompt, com redundâncias reduzidas.

A suíte suplementar tem nove situações; D05–D09 cobrem memória atual, premissa inventada, iniciativa casual, concordância e fala incompreensível. Em duas respostas reais do principal, D05 retomou música e lembranças, e D06 reconheceu a premissa incorreta, copiando o exemplo. Não há aceite de espontaneidade: os demais casos ficaram pendentes por cota do principal e indisponibilidade da reserva. Relatórios locais: `1791121505541-persona.json` e `1791121534123-persona.json`.

Os limites locais atuais são 1.000 chamadas / 5.000.000 de unidades conservadoras por dia, preservando os contadores e os planos gratuitos. Eles não ampliam cotas dos provedores.

Fine-tuning continua opcional. Primeiro avaliar texto correto e transcrição separadamente; depois reunir diálogos curados e aprovados, separar cenários de teste e comparar um modelo treinado com o baseline. Não usar estas respostas defeituosas como exemplos positivos. Treinar o LLM não corrige reconhecimento STT nem qualidade do TTS.
