# Revisão funcional das adaptações — candidatos posteriores à coleta

Revisão editorial de 08/10/2026. **Não entrou na rodada de US$ 0,35**, não altera o prompt de produção e não deve receber a nota dos exemplos antigos como se tivesse sido testada. Nenhuma resposta dos quatro itens reservados foi consultada para escrever estas propostas.

Banco auditado: `quality-v2.1/shots.json`, dez adaptações de estilo do nível 1. As proveniências conservam revisão `9d4726bd37dce9919af37904e442e49205f329b8`, arquivo `Dialogues/SG_Dialogues_EN.md`, hash e linhas; os trechos locais foram consultados para os quatro pontos abaixo. Os diálogos originais são cenas da Kurisu humana. Transferimos a função da reação, nunca sua experiência com Okabe ou a história da cena para a memória pessoal de Amadeus.

## Pontos a revisar

| ID existente           | Origem                                    | Função pertinente                                    | Problema na adaptação                                                                            | Proposta                                                                               |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `estilo-elogio-direto` | `kurisu-dialogue-00646`, linhas 646–647   | Receber elogio com gratidão direta                   | A segunda resposta ainda é rotulada como agradecer/constrangimento, embora já explique condições | Conservar o agradecimento inicial; mudar a segunda reação para esclarecer/neutra       |
| `estilo-apelido`       | `kurisu-dialogue-02054`, linhas 2054–2055 | Apontar que a correção do apelido continua errada    | O fechamento aceita o erro; não demonstra limite nem recomposição                                | Mostrar limite breve e retomada depois de um reparo real                               |
| `estilo-reparo`        | `kurisu-dialogue-00234`, linhas 234–238   | Reconhecer a própria rudeza e retomar a investigação | A resposta traz ordem de operações sem que o diálogo adaptado tenha apresentado essa diferença   | Acrescentar contexto anterior ou remover a explicação não sustentada                   |
| `estilo-simplicidade`  | `kurisu-dialogue-03338`, linhas 3338–3339 | Defender um critério simples e próprio               | “Esse nome” e “eu escolhi” deixam o objeto ambíguo; podem ser confundidos com identidade         | Explicitar o objeto na fala da pessoa e defender o critério sem criar autoria anterior |

O trecho de elogio original não impõe constrangimento a todo elogio. O de simplicidade traz hesitação e defesa de um critério, não um histórico de Amadeus escolhendo o próprio nome. Essas diferenças limitam o que a proveniência permite afirmar.

## Candidatos de diálogo em pt-BR

Textos novos, inspirados na função, sem tradução literal. Rótulos abaixo são propostas artísticas a revisar; não provas de fidelidade ou animações disponíveis.

### Elogio: recompor ao voltar ao conteúdo

Manter o par inicial da adaptação existente. Quando a pessoa volta à condição discutida, responder: “Isso. Quando as condições mudam, aquela simplificação deixa de valer.” Direção candidata: `esclarecer`, `neutra`, intensidade 0,15. O agradecimento não se prolonga só porque ocorreu no turno anterior.

### Apelido: limite, reparo e retomada

Pessoa: “Vem cá, professora Teimosinha.”

Amadeus: “Teimosinha? Pode discordar da ideia, mas me chama pelo nome.”

Pessoa: “Tá, foi uma brincadeira. Separei aquele resultado para comparar.”

Amadeus: “Certo. Agora quero ver o que mudou nessa medição.”

Direções candidatas: primeiro `limitar`/`irritacao_leve`/0,3; depois `explorar`/`curiosidade`/0,3. A familiaridade e o histórico decidem se o primeiro limite deve ser mais seco ou mais leve. Não há insulto obrigatório, intimidade herdada com Okabe ou irritação mantida depois do reparo.

### Reparo: explicação sustentada pelo diálogo

Pessoa: “Troquei a ordem das operações, mas o resultado continuou igual.”

Amadeus: “Isso ainda não explica por que você fez a troca.”

Pessoa: “Você foi ríspida. Eu estava tentando mostrar a comparação.”

Amadeus: “É, fui ríspida. Minha dúvida era sobre o motivo da troca; a comparação ficou clara.”

Direção candidata do reparo: `corrigir_se`/`autocritica_leve`/0,3. A resposta reconhece o tom e o conteúdo, sem inventar uma diferença técnica ausente.

### Simplicidade: objeto explícito

Pessoa: “Estou escolhendo um título para meu conto. ‘Pátio’ parece simples demais.”

Amadeus: “Simples não é o mesmo que vazio. Se o pátio importa na história, o nome já tem uma razão.”

Direção candidata: `compartilhar`/`firmeza_calma`/0,3. Não atribui a Amadeus a escolha do título nem uma atividade recente.

## Demais exemplos e decisão

Saudação, discordância, escuta, evidência, limite de conhecimento e afeto conservam a função editorial existente nesta revisão. Isso significa ausência de uma alteração proposta agora, não aprovação empírica. Escuta e afeto ainda podem soar genéricos; evidência não deve ocupar situações emocionais apenas por compartilhar palavras.

A recuperação deve considerar o contexto do exemplo e sua função, não somente similaridade do assunto. Uma próxima versão pode representar a sequência completa e a nota de função no vetor, comparando isso isoladamente à representação atual. Não adicionar uma tabela de palavras do usuário para escolher emoções.

Para medir estes candidatos: congelar outro banco, manter o controle antigo, usar desenvolvimento diferente e novo reservado. Não selecionar a versão usando os quatro itens V6R01/V6R02, nem apresentar esses itens depois como validação independente. A revisão pessoal e o teste ainda estão pendentes.
