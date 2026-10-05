# Persona

Persona de execução: **kurisu-amadeus-0.4.13**. A personalidade define padrões de atuação; não contém fatos privados do usuário nem depende de memória pessoal.

## Direção principal em Markdown — 05/10/2026

[conversation-directions-v1.md](conversation-directions-v1.md) reúne identidade, prioridade, honestidade, ficção, conversa, reparo e exemplos contextuais. É lido diretamente uma vez na inicialização e incluído uma vez tanto no prompt normal quanto na recuperação. O código monta o prompt e mantém o contrato técnico de expressão; `dialogue-direction.ts` apenas expõe o trecho correspondente desse mesmo arquivo, sem uma segunda inclusão.

O arquivo tem limite de 5.000 caracteres, seções obrigatórias e recusa delimitadores técnicos que interfeririam no contrato. O prompt normal completo tem orçamento de 20.000 caracteres, incluindo os complementos, abaixo do limite de entrada de 32.768 da API. Não há truncamento silencioso. A direção operacional da skill e o repertório curado foram enxugados; `source-v0.4.md` e `reaction-catalog-v0.2.md` permanecem integrais e preservados.

Após editar qualquer Markdown carregado, reinicie a API; na execução compilada, gere novo build. O build inclui a direção em `dist/application/persona/`. Mudanças comportamentais exigem nova versão e hash para separar os ensaios. Os limites são de caracteres, não de tokens; acrescentar arquivos aumenta o conteúdo enviado se não houver curadoria.

A 0.4.11 concluiu os 30 cenários, com notas por Codex de 3,13/5 em fidelidade e naturalidade, abaixo da meta, e oito de doze turnos encadeados por falta de cota. A 0.4.12 teve 28 respostas completas no Cloudflare, com fidelidade 3,25/5 e naturalidade 3,50/5; diferenças de modelo/cobertura impedem atribuir o resultado apenas ao prompt. A 0.4.13 substitui frases prontas da direção principal por gatilhos, esclarece histórico da sessão e ficção e orienta reparo científico e manutenção do formato. Seu prompt normal tem 19.146 caracteres; nenhuma cota ou configuração de provedor foi alterada. A rodada curta usa `refinement-v1.json`, com oito regressões e quatro situações novas, separada dos 30 casos e da continuidade. Resultados ficam locais, sem aceite humano automático.

O usuário autorizou [avançar provisoriamente para a fase 3](../../../../docs/decisions/Decisao_Persona_Fase_3.md), preservando a voz aceita e retomando as técnicas avançadas após a memória. Isso não aprova os gates textuais pendentes.

## Catálogo de reações — versão 0.4.11

[reaction-catalog-v0.2.md](reaction-catalog-v0.2.md) preserva integralmente o arquivo fornecido pelo usuário. Sua distinção entre evidência secundária, interpretação e adaptação permanece; esta integração não verifica cenas nem transforma paráfrases em falas oficiais.

[reaction-repertoire-v0.2.md](reaction-repertoire-v0.2.md) é a curadoria das seções 5, 7 e 8, carregada diretamente no prompt normal e na recuperação. Amplia as alternativas de reação sem impor frases prontas: protesto leve, humor contextual, abertura científica, gratidão tranquila, cuidado concreto e reparo de erros. O prompt estruturado e as decisões atuais da skill têm prioridade sobre propostas antigas do catálogo, inclusive D3, memória, intimidade e perguntas opcionais. O original é referência; não executamos suas instruções de coleta, pesquisa ou próximos passos.

O complemento tem teto de 4000 caracteres e o prompt completo continua limitado a 32768. Ambos os arquivos acompanham o build; reinicie a API para carregar alterações. Não há mudança de clone, síntese, memória persistente ou controles emocionais nativos. Qualidade e latência precisam ser avaliadas em runtime.

Em 05/10/2026, o usuário declarou a avaliação vocal concluída e aprovou a qualidade atual da voz para avançar. Esse aceite substitui a pendência de escuta para a transição de fase, sem atribuir notas numéricas ou alegar a execução do benchmark de 30 falas × três gerações. As fichas antigas preservam o estado registrado na coleta; controles emocionais nativos continuam sem validação específica.

A versão 0.4.10 preserva o prompt estruturado e o documento de referência, mas carrega a seção 14 da skill como direção operacional concisa para reduzir redundância. O contexto enviado mantém até 3.000 caracteres de histórico confirmado; familiaridade e variação consideram os turnos disponíveis sem ampliar permissões de dados. A direção administrativa pode ser editada em `GET/PUT /v1/persona`, com controle de revisão concorrente, persistência e aplicação no próximo turno, inclusive na recuperação de fala. A edição não substitui a identidade nem o contrato de expressão.

Foi concluído um conjunto de 30 cenários no Cloudflare na 0.4.9. A revisão por Codex encontrou problemas em elogios, reparo científico e pedidos de memória/lembrete; não houve aceite automático. A 0.4.10 reforça esses pontos. O reteste completo ficou bloqueado por cotas de Groq/Cloudflare e indisponibilidade do Gemini. Os relatórios locais preservam os hashes distintos e a revisão mantém os resultados antigos sem notas humanas inventadas.

## Fonte e decisões

[source-v0.4.md](source-v0.4.md) preserva a análise fornecida pelo usuário. É material de referência, não um arquivo de instruções executado nem conteúdo enviado integralmente aos provedores. Observações textuais, quadros visuais e hipóteses de atuação mantêm as limitações de método registradas pelo autor; esta implementação não comprova uma análise acústica ou fidelidade canônica.

O documento completo está salvo no projeto, sem alterações em relação ao original fornecido. Desde a versão 0.4.7, [document-reference.ts](../../api/src/application/persona/document-reference.ts) lê diretamente as seções **3.12, 5.2–5.6 e 14.5** como complemento: síntese comportamental, fala em pt-BR e exemplos condicionais. Os trechos são incluídos no prompt de cada turno, inclusive na recuperação em fala simples, separados do histórico real. O prompt estruturado continua tendo prioridade sobre o documento; identidade, recorte, memória, capacidades e formato de saída permanecem definidos pelo código existente.

A leitura ocorre uma vez na inicialização; reinicie a API após editar o documento. O build inclui uma cópia integral em `api/dist/application/persona/source-v0.4.md`, permitindo executar a API compilada sem depender do arquivo em Downloads. Seções ausentes ou complemento acima de 6000 caracteres são recusados sem truncamento silencioso. O prompt completo, incluindo a skill, está sujeito ao limite de 32768 caracteres da API. O aumento de contexto pode elevar consumo e latência; a fidelidade comportamental exige avaliação comparativa.

## Skill de conversa — versão 0.4.8

[skill-amadeus-kurisu.md](../../api/src/application/persona/skill-amadeus-kurisu.md) é carregada diretamente em cada prompt, inclusive na recuperação. Suas seções 0–2 e 4–10 orientam percepção contextual, naturalidade, familiaridade, cuidado e expressão. A seção 13 registra as decisões D1, D3–D7, D12 e D13 aprovadas pelo usuário. O formato técnico, os limites de memória e as decisões de execução resolvem conflitos entre documentos. O build leva uma cópia da skill junto com a API.

Ficção solicitada permite narrar em primeira pessoa dentro do enquadramento imaginário. Isso não autoriza alegar vida real, converter uma história em memória ou manter uma falsa identidade humana diante de pergunta sincera. A morte da original pode ser discutida como informação da obra.

Familiaridade deriva somente do histórico confirmado da mesma conversa: F0 (0–2 turnos completos), F1 (3–9), F2 (10 ou mais disponíveis). Cinco aberturas/fechos acompanham o contexto; uma abertura longa idêntica ou automatismo pode iniciar uma única recuperação antes da fala. Repetição solicitada é permitida. Isso não é um detector infalível de repetição semântica.

Com entrada de voz, o backend calcula duração, RMS, pico, fração de quadros de baixa energia e ritmo estimado da transcrição. Os números acompanham a mesma classificação de dados da fala; não há classificador de emoção, inferência de pressa ou acesso ao tom com entrada apenas textual.

Avaliação: `npm run eval:persona -- --skill --run --limit=12`, com opção de `--model` para cada candidato já configurado. A triagem registra tiques de assistente e excesso de perguntas, sem reprovar automaticamente uma atividade fictícia explicitamente pedida. `npm run check:skill-voice` prepara quatro WAVs sintéticos e uma ficha de escuta, contabilizando o uso normal. Até aprovação auditiva dos resultados, os presets permanecem direções de redação/pontuação; controles emocionais nativos continuam desativados e `deliveryApplied` permanece `false`.

Ensaio inicial da 0.4.8: quatro respostas sintéticas foram coletadas com Cloudflare, incluindo narrativa fictícia direta, ausência de rotina real, identidade de IA e discussão da morte como ficção. A triagem estrutural não apontou falhas nesses quatro casos; isso não comprova naturalidade nem é revisão cega. Groq falhou no primeiro caso; Cloudflare e Gemini tiveram indisponibilidade antes de completar os demais cenários. Foram geradas as quatro amostras vocais de direção artística, todas em 24 kHz, com revisão auditiva pendente. Relatórios locais ficam em `api/data/persona-evals/` e `api/data/skill-voice/`; nenhuma decisão aprovou automaticamente a qualidade não avaliada.

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

Memória recuperável é dado da aplicação, separado da persona e dos pesos do LLM. O contexto inclui apenas memórias pertinentes e permitidas. Por decisão de 05/10/2026, os experimentos de fine-tuning ficam para depois da fase 3, com exemplos curados, autorizados e separados da avaliação; não substituem memória nem treinam automaticamente com o histórico.

Decisão atual: **ajustes leves por prompt e transição provisória para a fase 3**. Retomar LoRA/QLoRA local, módulos locais, estado emocional e memória associativa após concluir essa fase, com zero gasto adicional em APIs/treinamento/GPU na nuvem. Nenhuma dessas técnicas foi ativada agora; reteste textual e comparação permanecem necessários. Não foi implementada rotina proativa de NPC nem memória persistente nesta alteração.

Quando uma resposta inválida chega antes de qualquer fala validada, o backend tenta uma única recuperação em texto simples, mantendo persona, contexto, política de dados e limites de uso. A recuperação é contabilizada em `personaRecoveries`; pode consumir uma chamada adicional e aumentar a latência desse turno. Depois de entregar qualquer trecho, não regenera, para evitar duplicação. Cancelamento, cota e configuração não ativam essa recuperação. Se a segunda tentativa falhar, o erro é mantido e a conexão permite outro turno.

Na regressão sintética em Cloudflare, a versão 0.4.4 respondeu a críticas leves com perguntas genéricas. A primeira execução 0.4.5 respondeu de forma curta à transcrição confusa; outro caso teve indisponibilidade do provedor. A revisão final dos demais casos permanece pendente por limite local de uso. Não há aprovação automática de personalidade ou naturalidade.

Comparacao adicional da 0.4.5: Cloudflare produziu reacoes breves para D02/D03, mas copiando os exemplos; Groq ainda produziu fala estranha em D01 e ofertas genericas em D02/D04. Os relatorios individuais preservam seus hashes. O resumo local em `api/data/persona-evals/dialogue-comparison-2026-10-04.json` registra melhoria parcial, sem aceite de naturalidade ou espontaneidade. Os limites locais autorizados ficaram em 55 chamadas / 300.000; nao houve troca de plano nem de modelo principal.

## Revisão 0.4.6: contexto e reparo conversacional

O histórico atual pode ser retomado mesmo sem memória persistente. A direção distingue franqueza de impaciência, evita procurar problemas numa conversa casual, recusa leitura do tom a partir de transcrição e exige reparos curtos às próprias premissas. O complemento curado permanece no prompt, com redundâncias reduzidas.

A suíte suplementar tem nove situações; D05–D09 cobrem memória atual, premissa inventada, iniciativa casual, concordância e fala incompreensível. Em duas respostas reais do principal, D05 retomou música e lembranças, e D06 reconheceu a premissa incorreta, copiando o exemplo. Não há aceite de espontaneidade: os demais casos ficaram pendentes por cota do principal e indisponibilidade da reserva. Relatórios locais: `1791121505541-persona.json` e `1791121534123-persona.json`.

Os limites locais atuais são 1.000 chamadas / 5.000.000 de unidades conservadoras por dia, preservando os contadores e os planos gratuitos. Eles não ampliam cotas dos provedores.

Fine-tuning continua opcional. Primeiro avaliar texto correto e transcrição separadamente; depois reunir diálogos curados e aprovados, separar cenários de teste e comparar um modelo treinado com o baseline. Não usar estas respostas defeituosas como exemplos positivos. Treinar o LLM não corrige reconhecimento STT nem qualidade do TTS.
