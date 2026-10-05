# Persona: avanço para a fase 3 e experimentos posteriores

Decisão do usuário em **05/10/2026**. Escopo atual: ajustar a direção por prompt, avançar para a memória da fase 3 e retomar as técnicas avançadas após concluir essa fase.

## Evidência e transição

A persona `kurisu-amadeus-0.4.11` concluiu 30 cenários textuais no `qwen/qwen3.8-27b:free` via OpenRouter. A revisão por Codex atribuiu 3,13/5 em fidelidade e naturalidade: 11 respostas boas, 19 com ajustes. Dois cabeçalhos expressivos inválidos receberam fallback neutro. O diálogo encadeado completou oito de doze turnos, usando respostas realmente geradas; os demais foram bloqueados por cotas. Os relatórios locais preservam respostas, hashes, modelos e falhas em `code/backend/api/data/persona-evals/`, ignorado pelo Git.

O usuário já aceitou a voz e autoriza prosseguir para a fase 3 após os ajustes leves. Isso é **aceite provisório da transição**, com pendências textuais conhecidas; não certifica nota mínima de 4/5, melhora medida da nova versão ou funcionamento prolongado. O reteste de texto e os quatro turnos pendentes continuam no backlog de qualidade. Uma nova versão deve ter seu próprio hash e resultados, sem aproveitar as notas anteriores como validação.

**Reteste posterior da 0.4.12, em 05/10/2026:** nove respostas no Groq antes da cota; 30 cenários tentados no Cloudflare, com 28 respostas completas. Avaliação por Codex nas 28: fidelidade 3,25/5, naturalidade 3,50/5, 15 boas e 13 para revisar. P29 produziu JSON/rubrica brutos em duas tentativas e foi bloqueado com `PROVIDER_INVALID`, sem fala; P30 ficou sem resposta por cota/indisponibilidade. A continuidade da nova versão não avançou além da tentativa de D01 por cota. A mudança de provedor/modelo impede atribuir diferenças apenas ao prompt; o gate permanece pendente. Relatórios locais: `api/data/persona-evals/review-0.4.12.md` e `review-0.4.12-groq.md`. Nenhum limite, provedor ativo ou faturamento foi alterado, nem houve novo teste vocal.

## Ajuste imediato — persona 0.4.12

A direção principal e os exemplos contextuais passam para [conversation-directions-v1.md](../../code/backend/assets/persona/conversation-directions-v1.md), lido diretamente pelo prompt normal e pela recuperação. O código mantém montagem, versão, contrato expressivo e validação. Limites: 5.000 caracteres para esse arquivo e 20.000 para o prompt normal completo; entradas inválidas/excessivas são recusadas, sem corte silencioso. Esses valores são caracteres de texto, não tokens ou estimativas de cobrança.

Prioridades: responder ao pedido concreto, concordância feminina, reação breve a elogios/críticas, humor ligado ao assunto, cuidado concreto, ficção explicitamente solicitada e fatos corrigidos prevalecendo no histórico. Os exemplos são direções, não respostas fixas ou fatos do usuário. As fontes originais, o catálogo completo e as seções completas da skill permanecem no projeto; a direção operacional da skill e o repertório curado têm redundâncias reduzidas.

Nenhuma nova chamada de LLM é acrescentada ao fluxo, nem são ativados provedores pagos, treinamento, estado neuroquímico ou memória persistente nesta alteração. Voz, STT/TTS, presets e parâmetros aceitos são preservados. Testes de código verificam montagem, limites e contrato; naturalidade exige reteste de inferência quando houver cota.

## Refinamento autorizado — persona 0.4.13

Em 05/10/2026, o usuário autorizou ajustes pontuais seguidos de rodada curta, deixando a avaliação completa para quando houver cota. A direção principal passa a descrever gatilhos e reações, sem frases prontas nessa seção. Elogio comum não dispara ressalva sobre perfeição; saudação social não pede apresentação de IA; uma correção verdadeira pede reconhecimento do erro e substituição da afirmação. Histórico da sessão é distinto de memória persistente. Personagem declarada pelo usuário não comprova identidade real ou lembrança compartilhada; ficção explicitamente pedida continua permitida. Pedidos de JSON/gestos devem receber prosa natural mantendo o contrato técnico.

O reparo científico inclui plasticidade funcional/estrutural de neurônios e conexões; não se sustenta a afirmação de que neurônios são imutáveis. Referência de pesquisa, fora do conteúdo enviado por turno: [Xu et al., 2009 — formação e estabilização de sinapses em aprendizagem motora](https://www.nature.com/articles/nature08389), estudo experimental em camundongos, não comprovação de memória idêntica entre espécies ou eficácia da persona.

Versão `kurisu-amadeus-0.4.13`, prompt normal de 19.146 caracteres e direção de 4.843, dentro dos tetos já existentes. Código de montagem, fontes originais, modelo ativo, cotas e voz aceitos são preservados. `refinement-v1.json` reúne oito regressões e quatro situações novas; não substitui o conjunto completo nem o diálogo gerado. A decisão de avançar provisoriamente para a fase 3 continua vigente, com o gate de qualidade pendente.

O reteste curto concluiu quatro respostas no Groq (D01–D03 e D09) e uma no Gemini (D01), registradas separadamente. O Groq admitiu o erro científico e não introduziu perfeição nos elogios; a saudação continuou artificial e D09 repetiu a frase do outro elogio. Cloudflare bloqueou por cota; Gemini falhou nos pedidos posteriores. Depois de respeitar o prazo informado pelo Groq, D09 respondeu, mas D10 exigiu nova espera de aproximadamente 34 minutos. Cinco regressões e três casos novos continuam pendentes nesse modelo. Relatório local: `api/data/persona-evals/review-0.4.13.md`, com falhas e notas do agente; nenhum aceite humano ou ganho estável foi declarado. Testes de código passaram, e a API local estava desligada ao fim da alteração; iniciar a API carrega o Markdown novo.

## Marco de código antes da fase 3 — 05/10/2026

O usuário autorizou separar e registrar as alterações em commits Conventional Commits, com títulos em pt-BR e sem descrição, para preparar a implementação da fase 3. A base preservada é a persona 0.4.13, os complementos Markdown, as reservas de LLM e os conjuntos de avaliação. A próxima etapa é memória e recuperação; técnicas avançadas continuam posteriores à conclusão dessa fase.

A implementação da fase 2 está entregue para esta transição: persona configurável e versionada, estado expressivo e eventos por segmento, perfis vocais versionados, voz aceita e ferramentas de avaliação. O gate de qualidade/continuidade textual permanece pendente, com resultados parciais abaixo da meta. Os benchmarks físicos de latência e interrupção e a confirmação prolongada de funcionamento continuam como pendências da fase 1 e integração, sem transformar o aceite provisório em comprovação dessas metas.

Os ensaios demonstram inconsistência e retorno limitado dos ajustes realizados, mas não provam o limite técnico de prompt engineering. Faltam coleta completa na versão atual, comparação controlada no mesmo modelo, repetição e cobertura independente. O avanço é uma decisão de sequência do projeto, não uma conclusão de que ajustes de prompt sejam incapazes de melhorar ou que técnicas avançadas resolverão as falhas. Os gates e as cotas existentes são preservados.

Relatórios brutos, notas locais, banco, credenciais e referências vocais privadas ficam fora dos commits. Os resultados resumidos e as pendências permanecem documentados no projeto.

## Após concluir a fase 3

Retomar os experimentos separadamente, com baseline, versões e reversão:

1. **Estado emocional local inspirado em neurochemistry:** variáveis artísticas de curiosidade, preocupação e familiaridade, com transições limitadas e efeitos mensuráveis na conversa. Nomes biológicos não demonstram fidelidade neurocientífica.
2. **Memória associativa inspirada em Hebb:** relações entre conceitos e fatos autorizados, reforço por uso e relevância. Correções e exclusões devem alcançar as associações derivadas; isso não modifica pesos do LLM.
3. **Módulos locais de contexto, memória e direção:** comparar com a chamada principal única; chamadas extras de LLM somente em ensaio com orçamento explícito. Não reproduzir automaticamente treze módulos remotos por turno.
4. **LoRA/QLoRA local:** curar diálogos sintéticos revisados em pt-BR, separar treino/validação/teste e experimentar inicialmente um modelo pequeno na RTX 4060 de 8 GB. Viabilidade e qualidade precisam ser medidas; o adaptador local não altera automaticamente modelos hospedados no Groq/OpenRouter.

A restrição é **zero gasto adicional com APIs, treinamento ou GPU em nuvem**: usar recursos locais e cotas gratuitas, contabilizando todas as tentativas. Há consumo de energia, armazenamento e tempo. O teto local OpenRouter autorizado de 60 pedidos não amplia a cota real e não será elevado automaticamente. Essa decisão não muda custos/planos dos serviços de voz existentes.

Adotar somente ganhos demonstrados em naturalidade, fidelidade, continuidade e latência, preservando honestidade, controle de memória e zero desqualificações. Os 30 cenários de avaliação não entram no treinamento; incluir situações novas para verificar generalização. Treinamento não usa automaticamente conversas pessoais e não substitui a memória editável da fase 3. Qualquer adoção em produção exige comparação e decisão própria; esta autorização define a ordem de trabalho, não um aceite antecipado das técnicas.

Referências para os experimentos: [projeto citado pelo usuário](https://www.reddit.com/r/steinsgate/comments/1tiw9vb/i_actually_built_a_loreaccurate_amadeus_system/), [QLoRA](https://arxiv.org/abs/2305.14314) e [estudo de LoRA/QLoRA na RTX 4060](https://arxiv.org/abs/2509.12229). São referências de investigação, não prova de ganho no nosso projeto.
