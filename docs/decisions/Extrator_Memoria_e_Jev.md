# Extrator independente e Jev no refinamento

Decisão do usuário em 05/10/2026: aplicar extração semântica na fase 3 com um modelo independente das LLMs da conversa e zero gasto adicional com API. Provisoriamente, foi escolhido Groq `openai/gpt-oss-20b`. As ideias de Jev para personalidade e voz ficam para depois da fase 3, junto aos experimentos de fine-tuning e módulos de contexto.

## Decisão implementada para a memória

A análise recebe fala natural, contexto recente e memórias confirmadas elegíveis, em segundo plano. Produz sugestões sustentadas por citações das falas do usuário. O código valida, deduplica por normalização, controla classificação/permissões, registra acontecimentos com validade e vincula correções a ID e versão do alvo. Duplicações semânticas são evitadas também pela orientação ao modelo, mas não há garantia universal de equivalência de paráfrases. Revisão permanece disponível; o modo padrão a exige, enquanto a opção de aprovação automática autorizada pelo usuário dispensa confirmação por ID das novas extrações validadas.

O provedor da memória possui configuração versionada, limites e contabilização próprios. Não usa o roteamento nem as reservas da conversa. Cota ou indisponibilidade adiam tarefas. Inicialmente foi utilizada a chave Groq existente; por solicitação posterior do usuário, o perfil passou a usar `GROQ_GPT_OSS_API_KEY`, dedicada ao extrator, enquanto a conversa conserva suas credenciais. O usuário informou que a chave pertence a outra conta; a aplicação não verifica sua organização ou os limites remotos. Não há rotação automática entre contas. O preço efetivo continua condicionado ao plano gratuito e aos limites da organização. O sistema não ativa pagamentos. [Modelo](https://console.groq.com/docs/model/openai/gpt-oss-20b), [limites](https://console.groq.com/docs/rate-limits).

Gemini gratuito pode servir aos testes sintéticos, mas seus termos pedem que não sejam enviados dados pessoais/confidenciais/sensíveis. Ele permanece bloqueado para memória pessoal. Seus limites são por projeto; uma chave nova no mesmo projeto não isola a cota. Não é necessário criar contas extras para a configuração Groq aprovada. [Termos](https://ai.google.dev/gemini-api/terms?hl=pt-BR), [limites Gemini](https://ai.google.dev/gemini-api/docs/rate-limits).

A arquitetura e os comandos estão em [Memoria_Fase_3.md](../architecture/Memoria_Fase_3.md). O prompt é um [Markdown versionado](../../code/backend/api/src/application/memory/memory-extraction-v1.md), separado da persona.

## Alternativa Z.ai para uma cota separada

Após discutir as restrições da Groq sobre múltiplas contas para ultrapassar limites, o usuário forneceu `ZAI_GLM_FLASH` para avaliar `glm-4.7-flash`. O adaptador e o perfil candidato usam somente esse modelo e o endpoint oficial. A tabela atual o lista como gratuito; FlashX e outros modelos pagos são recusados. A avaliação pode carregar `--profile=config/memory-extractor.zai.example.json` sem modificar o extrator ativo. A cota local continua contabilizada, inclusive em tentativas malsucedidas. Não há compra de créditos, plano pago ou rotação de contas. [Preços Z.ai](https://docs.z.ai/guides/overview/pricing).

As chamadas de memória usam JSON mode, sem raciocínio exposto, e passam pelas validações locais existentes. A API não documenta a mesma garantia de JSON Schema estrito usada na Groq; por isso, acesso e qualidade precisam ser verificados separadamente antes da adoção. Os termos adicionais permitem integrar a API em aplicações e dizem que o conteúdo de usuários da API não é utilizado para melhoria sem consentimento explícito. O DPA prevê processamento de dados pessoais e declara não armazenar o conteúdo das chamadas. Isso é uma declaração contratual do provedor, não uma auditoria realizada pelo Amadeus. [Termos da API](https://docs.z.ai/legal-agreement/terms-of-use#additional-terms-for-api-services), [DPA](https://docs.z.ai/legal-agreement/privacy-policy#data-processing-addendum-for-api-services).

Esse perfil se destina à extração operacional de memória. Não autoriza reaproveitar saídas para fine-tuning ou treinamento de modelos externos; esses experimentos permanecem posteriores e precisam de revisão própria dos termos e das fontes de dados.

### Verificação de acesso em 05/10/2026

O usuário confirmou que a chave foi gerada no painel geral da API. A primeira chamada sintética foi recusada como cota/limite; o código específico do corpo não foi capturado nessa tentativa. As chamadas seguintes, incluindo uma requisição mínima por outro cliente HTTP, terminaram por timeout. A conectividade HTTPS sem autenticação respondeu, mas isso não verifica acesso ao modelo. Não houve geração válida, portanto a qualidade semântica da Z.ai ainda não foi avaliada e não é possível atribuir a falha a um pacote, plano ou limite diário específico.

O extrator ativo permanece Groq `openai/gpt-oss-20b`, com `GROQ_GPT_OSS_API_KEY`. O candidato Z.ai não foi salvo na configuração ativa. Os ensaios utilizaram somente dados fictícios e não gravaram fatos. Relatórios locais ficam em `data/memory-evals/`. Formatação, lint, tipos, build e os 314 testes da API passaram; esses testes verificam a integração e os contratos, sem comprovar disponibilidade da conta remota. Para concluir a adoção, é necessário obter uma resposta válida com `glm-4.7-flash` no acesso gratuito e repetir o ensaio semântico antes de aplicar o perfil.

O usuário solicitou manter provisoriamente `GROQ_GPT_OSS_API_KEY` após recolocar a chave, até validar o GLM. A configuração ativa foi conferida e o ensaio remoto da Groq passou nas sete verificações em aproximadamente 3,2 segundos, com uma chamada e dados inteiramente fictícios. O relatório está em `data/memory-evals/semantic-2026-10-05T19-46-27-710Z.json`. Esse ensaio verifica extração, contrato e evidências; não grava fatos nem substitui o teste de armazenamento e recuperação em uma conversa. A política ativa permanece habilitada para dados pessoais, extração por LLM e retenção de 30 dias. Reiniciar a API é necessário se sua execução começou antes da atualização do `.env`.

## Análise da proposta de Jev

Jev é apropriado como candidato a classificador/avaliador de bastidores. Sua interface oficial trabalha com escolhas, rubricas e probabilidades; não gera texto livre. Portanto, poderia avaliar se um candidato a memória é sustentado, temporário ou relevante, mas uma LLM generativa ainda precisaria extrair/escrever fatos novos. Isso é uma conclusão de arquitetura a partir da interface documentada, não um resultado medido no Amadeus. [Interface Jev](https://docs.typesafe.ai/introduction).

A TypeSafe anuncia US$ 0,042 por milhão de tokens de entrada, com saída não cobrada. Esse preço corresponde à entrada da avaliação e não torna as chamadas da LLM principal, as regenerações ou o TTS gratuitos. Também não é uma autorização para contratar Jev agora. [Anúncio oficial](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

As afirmações de classificação em 70 ms, melhora drástica e ausência perceptível de quebra da persona ficam como hipóteses. Para o projeto, importam latência de rede, tamanho do estado, custo total e erros em pt-BR. Confiança de um modelo não comprova uma emoção nem dispensa verificação.

| Proposta                | Aplicação possível                                                                                      | Ajuste necessário no experimento                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direção de tom          | Estimar sinais textuais de ironia, urgência ou frustração para uma direção curta, subordinada à persona | Texto do STT não preserva toda a prosódia; tratar resultado como hipótese de tom, com fallback neutro, sem armazenar emoção inferida como fato pessoal |
| Direção do TTS          | Classificar intenção de segmentos e mapear para controles vocais previamente verificados                | Usar a API real do Cartesia e do modelo/clone aceitos; não assumir que SSML, pitch ou presets de outro fornecedor são intercambiáveis                  |
| Consistência de persona | Avaliar segmentos ou respostas segundo rubricas dos Markdown e revisão humana                           | Validar antes de liberar o segmento se a intenção for impedir que o usuário o ouça; análise posterior só pode orientar turnos seguintes                |

## Dependências de latência

Não é possível iniciar uma requisição à LLM principal e depois alterar retroativamente seu prompt quando o Jev terminar. Para usar a classificação da fala atual, a requisição precisa aguardar esse resultado; isso adiciona uma dependência à latência. Alternativas a medir: um prazo curto com fallback, uso do estado do turno anterior ou classificação antes da requisição principal. Geração especulativa de respostas alternativas consome mais cota e não está autorizada como padrão gratuito.

Supervisão antes do TTS também pode atrasar o primeiro áudio. Uma regeneração precisa ter limite de tentativas e orçamento; não recupera áudio já ouvido. A promessa de que o usuário nunca perceberá uma quebra não pode ser garantida por esse arranjo.

## Plano após a fase 3

1. Conservar um baseline da persona e voz aceitas; testar cada módulo separadamente em dados sintéticos.
2. Criar rubricas com exemplos novos em pt-BR: sarcasmo explícito/ambíguo, elogio, erro científico, frustração, ficção e continuidade.
3. Medir falsos positivos, discordância com revisão humana, naturalidade/fidelidade, latência p50/p95 até primeiro áudio e uso total de tokens/chamadas.
4. Comparar o classificador gratuito/local com Jev apenas se houver ensaio autorizado e orçamento explícito; custo baixo não equivale a custo zero.
5. Avaliar o resultado em conjunto com LoRA/QLoRA e módulos de estado, sem atribuir melhorias a uma técnica quando várias mudam ao mesmo tempo.

Nada dessa seção altera a personalidade ou os controles de TTS em produção nesta fase. Adoção depende de ganho demonstrado, compatibilidade com o clone, reversão e decisão posterior do usuário.
