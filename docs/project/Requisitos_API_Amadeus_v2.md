# Requisitos funcionais

Requisitos funcionais previstos para o projeto Amadeus, que tem a conversa por voz em tempo real como foco. A tabela abaixo os enumera.

| Número de Ordem | Requisito | Descrição | Prioridade |
| --- | --- | --- | --- |
| RF-001 | O cliente envia a credencial de acesso nas operações protegidas. | Envio do token nas chamadas REST e de um ticket temporário, de uso único, na abertura do canal de voz. | Alta |
| RF-002 | O sistema rejeita requisições sem acesso válido. | Resposta de acesso negado para credenciais inválidas ou revogadas e para acesso a dados de outro proprietário. | Alta |
| RF-003 | O administrador gerencia os clientes autorizados. | Cadastro, listagem e revogação dos acessos de vários clientes. Adiado nesta etapa; permanece a autenticação básica para uso pessoal. | Média |
| RF-004 | O usuário inicia uma chamada de voz com a Amadeus. | Abertura de uma sessão em tempo real, em português brasileiro, com voz personalizada e sem apertar botões a cada fala. | Alta |
| RF-005 | O usuário encerra a chamada de voz. | Fechamento da sessão, parada do áudio, gravação da conversa e agendamento persistente das tarefas de memória. | Alta |
| RF-006 | O usuário envia a sua fala em tempo real. | Envio contínuo do áudio do microfone durante a chamada, com formato definido, ordenação e limite de áudio pendente. | Alta |
| RF-007 | O sistema detecta o início e o fim da fala do usuário. | Identificação dos turnos desde o primeiro protótipo de voz, com tratamento de ruído e eco. | Alta |
| RF-008 | O sistema transcreve a fala do usuário. | Conversão da fala em texto durante a chamada, com indicação do modo utilizado: incremental ou por segmentos de áudio. | Alta |
| RF-009 | O sistema informa a transcrição ao cliente. | Envio da transcrição final e das parciais, quando disponíveis, para exibição como legenda sem duplicar o histórico. | Média |
| RF-010 | O sistema gera a resposta da Amadeus. | Geração pela LLM com base na persona, na entrada do usuário e na memória permitida, com respostas curtas por padrão. | Alta |
| RF-011 | O sistema converte a resposta em fala com voz personalizada. | Síntese de cada segmento assim que estiver disponível, sem esperar a resposta completa nem ler instruções de atuação. | Alta |
| RF-012 | O sistema transmite o áudio da resposta em tempo real. | Envio progressivo de segmentos identificados para reprodução ordenada, com registro do modo de geração e transmissão. | Alta |
| RF-013 | O usuário interrompe a Amadeus enquanto ela responde. | Parada imediata do áudio no cliente, limpeza do áudio pendente, cancelamento da geração e descarte de resultados atrasados. | Alta |
| RF-014 | O sistema informa o estado da conversa ao cliente. | Envio do estado da conexão e do turno, distinguindo escuta, geração, reprodução, cancelamento e falha. | Média |
| RF-015 | O usuário envia mensagens de texto à Amadeus. | Envio de texto durante a chamada ou fora dela, com ordenação ou interrupção da resposta ativa, conforme a ação do usuário. | Alta |
| RF-016 | O usuário envia imagens à Amadeus. | Envio de imagens JPEG, PNG ou WebP, com validação do conteúdo, tamanho, dimensões e propriedade do arquivo. | Alta |
| RF-017 | O sistema interpreta as imagens enviadas. | Análise por uma LLM com suporte a imagens e comentário da Amadeus por voz personalizada ou texto. | Média |
| RF-018 | O sistema aplica a persona da Amadeus nas respostas. | Manutenção de curiosidade, racionalidade, humor seco e afeto discreto, com fala natural e sem bordões repetitivos. | Alta |
| RF-019 | O administrador configura a persona da Amadeus. | Edição do prompt sem reiniciar o sistema, com validação e aplicação da nova versão a partir do próximo turno. | Média |
| RF-020 | O sistema seleciona a emoção de cada segmento da resposta. | Definição de intenção, emoção e intensidade conforme o contexto, com transições graduais e expressão neutra em caso de falha. | Média |
| RF-021 | O sistema informa a emoção junto com a resposta. | Envio de metadados associados ao segmento de áudio, para sincronizar a expressão do avatar com a reprodução. | Média |
| RF-022 | O usuário gerencia as conversas. | Criação, listagem e exclusão de conversas, com remoção ou atualização dos arquivos, resumos e fatos derivados. | Média |
| RF-023 | O usuário consulta o histórico de uma conversa. | Visualização de mensagens, transcrições e imagens em ordem cronológica, com indicação de respostas interrompidas ou parciais. | Alta |
| RF-024 | O sistema armazena as mensagens e as transcrições. | Persistência durante a chamada, com data, hora e pontos de recuperação, sem depender apenas do encerramento normal. | Alta |
| RF-025 | O sistema gera resumos das conversas. | Criação de resumos ao encerrar e durante chamadas longas, por tarefas persistentes que respeitam as cotas disponíveis. | Média |
| RF-026 | O sistema extrai fatos sobre o usuário. | Registro de informações relevantes com origem, data e indicação de fato declarado, inferido ou confirmado. | Média |
| RF-027 | O sistema considera a memória nas respostas. | Seleção de resumos e fatos permitidos por recência, categoria e busca textual, dentro do limite de contexto. | Alta |
| RF-028 | O usuário gerencia os fatos armazenados. | Consulta, correção e exclusão de fatos e seus derivados, com bloqueio de reextração e opção de remover a informação do histórico. | Média |
| RF-029 | O administrador configura a voz personalizada da Amadeus. | Seleção da identidade vocal, referência e configurações aprovadas, preservando a voz entre sessões e emoções. | Alta |
| RF-030 | O administrador troca os provedores de LLM, STT e TTS. | Troca por configuração entre adaptadores já implementados, com verificação de suas capacidades e compatibilidade. | Média |
| RF-031 | O cliente consulta a documentação da API. | Disponibilização do OpenAPI e do protocolo de voz, incluindo eventos, áudio, autenticação, estados e reconexão. | Média |
| RF-032 | O cliente consulta o estado do sistema. | Endpoint de saúde da API, com diagnóstico protegido das dependências e sem exposição de segredos. | Média |
| RF-033 | O sistema registra os logs e as métricas de operação. | Registro de erros, latência, consumo e recursos, distinguindo geração e reprodução, sem conteúdo pessoal por padrão. | Média |
| RF-034 | O sistema mantém versões dos perfis de voz. | Registro da referência vocal, do modelo e das configurações de expressão, usando somente controles suportados e testados. | Alta |
| RF-035 | O sistema adapta a atuação vocal à personalidade da Amadeus. | Coordenação de texto, intenção, pausas e expressividade, com preservação da identidade vocal e avaliação por escuta sem avatar. | Alta |
| RF-036 | O cliente apresenta a Amadeus em um avatar Live2D. | Exibição de expressões, olhar, piscar e movimentos sutis, associados ao estado da conversa e à emoção de cada segmento. | Alta |
| RF-037 | O cliente sincroniza a boca do avatar com a fala. | Movimento da boca pela amplitude do áudio reproduzido, com suavização e parada imediata ao interromper a resposta. | Alta |
| RF-038 | O usuário utiliza a Amadeus em um aplicativo desktop. | Entrega do aplicativo Windows empacotado com Tauri, com Live2D, voz personalizada e instruções de conexão aos serviços. | Alta |
| RF-039 | O sistema registra a parte reproduzida da resposta. | Armazenamento separado do texto gerado e da reprodução confirmada pelo cliente, com indicação de trechos parciais ou incertos. | Alta |
| RF-040 | O sistema recupera as tarefas de memória após falhas. | Retomada de trabalhos persistentes com tentativas limitadas e prevenção de resumos ou fatos duplicados. | Alta |
| RF-041 | O sistema gerencia as cotas dos provedores. | Controle de consumo e avisos de esgotamento, com alternativas configuradas entre turnos e sem ativar cobrança automaticamente. | Alta |
| RF-042 | O sistema controla os dados enviados à nuvem. | Aplicação da política de envio a mensagens, transcrições, imagens e memória, bloqueando conteúdo incompatível com o provedor. | Alta |
| RF-043 | O cliente consulta as capacidades e o consumo do sistema. | Exibição dos recursos disponíveis e dos limites conhecidos ou estimados, distinguindo estimativas de valores do provedor. | Média |
| RF-044 | O projeto avalia a qualidade dos modelos e da voz. | Comparação de 30 cenários por LLM e 30 falas com três gerações por voz, registrando personalidade, naturalidade e desempenho. | Alta |
| RF-045 | O usuário retoma a chamada após uma queda de conexão. | Reconexão autenticada com recuperação do contexto confirmado, sem duplicar mensagens nem reproduzir áudio cancelado. | Alta |

# Requisitos não funcionais

Requisitos não funcionais previstos para o projeto Amadeus. A tabela abaixo os enumera.

| Número de Ordem | Requisito | Descrição | Prioridade |
| --- | --- | --- | --- |
| RNF-001 | O sistema deve restringir o acesso às conversas e à memória. | Acesso permitido somente ao proprietário autenticado, incluindo mensagens, arquivos e tarefas de memória. | Alta |
| RNF-002 | O sistema deve proteger as chaves e os segredos. | Armazenamento das chaves dos provedores somente no servidor, fora do código, dos logs e do aplicativo cliente. | Alta |
| RNF-003 | O sistema deve buscar iniciar a fala em até 2 segundos. | Meta inicial de mediana até 2 segundos após o fim da fala. Medição de pelo menos 100 turnos, com registro do percentil 95 e das condições. | Alta |
| RNF-004 | O sistema deve interromper o áudio em até 500 ms na meta definida. | Meta de percentil 95 até 500 ms entre nova fala e silêncio efetivo, em pelo menos 30 testes com Live2D ativo. | Alta |
| RNF-005 | O sistema deve validar todas as entradas. | Validação de mensagens, áudio, imagens, identificadores, ordem e metadados antes do processamento. | Alta |
| RNF-006 | O sistema deve limitar o tipo e o tamanho das imagens. | Aceitação de JPEG, PNG e WebP até 10 MB, com limite de dimensões e respeito aos limites menores do provedor. | Média |
| RNF-007 | O sistema deve remover os metadados das imagens. | Exclusão dos dados EXIF, como localização, antes do armazenamento final e do envio da imagem processada. | Média |
| RNF-008 | O sistema deve limitar o consumo de recursos e serviços. | Limitação de requisições, tokens, sessões, tentativas e áudio pendente, sem migração automática para serviços pagos. | Alta |
| RNF-009 | O sistema deve persistir e permitir restaurar os dados. | Preservação dos dados confirmados após reinício e restauração testada de backups consistentes do banco e dos arquivos. | Alta |
| RNF-010 | O sistema deve trafegar os dados de forma segura. | Uso de HTTPS e WSS fora de localhost, inclusive quando exposto na rede local, com validação da origem do cliente. | Alta |
| RNF-011 | O sistema deve manter a compatibilidade da API. | Versionamento do contrato REST e do protocolo de voz, com negociação de formato de áudio e tratamento de versões incompatíveis. | Média |
| RNF-012 | O sistema deve oferecer continuidade quando um componente falhar. | Digitação se STT falhar, texto se TTS falhar e aviso ou alternativa se LLM falhar. A recuperação não substitui a voz personalizada. | Média |
| RNF-013 | O sistema deve permitir reconexão sem duplicar respostas. | Retomada por identificadores e pontos de recuperação, com descarte de áudio antigo e preservação do contexto. | Média |
| RNF-014 | O backend deve ser executável em contêiner. | Configuração por variáveis de ambiente, volumes e instruções de GPU. O aplicativo desktop possui instalador separado. | Média |
| RNF-015 | O sistema deve possuir testes automatizados. | Cobertura de autenticação, memória, exclusão, estados, cotas e recuperação, complementada por testes reais de áudio. | Média |
| RNF-016 | O sistema deve estar disponível por pelo menos 95% do tempo mensal. | Garantia mensal adiada nesta etapa. Permanecem o registro de disponibilidade, o acompanhamento de falhas e a recuperação. | Baixa |
| RNF-017 | O sistema deve preservar a identidade da voz personalizada. | Manutenção de voz reconhecível entre sessões e emoções, com referência autorizada e nota média de identidade de pelo menos 4/5. | Alta |
| RNF-018 | O sistema deve produzir fala natural e emocionalmente adequada. | Metas de nota média de pelo menos 4/5 e intenção reconhecida em 80% das falas, avaliadas pelo usuário sem avatar. | Alta |
| RNF-019 | O sistema deve controlar o uso de memória e processamento. | Contexto e filas limitados, com medição de RAM, VRAM e velocidade de síntese durante chamadas com o avatar ativo. | Alta |
| RNF-020 | O sistema deve evitar efeitos duplicados em operações repetidas. | Uso de identificadores estáveis para que reenvios e reinícios não dupliquem mensagens, resumos ou fatos. | Alta |
| RNF-021 | O sistema deve respeitar a política de dados do provedor. | Controle do conteúdo enviado e da retenção, com revisão da política e testes que verifiquem o bloqueio de dados inelegíveis. | Alta |
| RNF-022 | O cliente deve manter o Live2D fluido e sincronizado. | Animação sem causar cortes na reprodução, com expressão vinculada ao segmento e boca vinculada ao áudio efetivo. | Alta |
| RNF-023 | O aplicativo desktop deve funcionar após a instalação. | Validação no Windows de microfone, dispositivos, chamada, Live2D e reinício, com dependências dos serviços documentadas. | Alta |
| RNF-024 | O sistema deve informar as capacidades reais dos adaptadores. | Distinção entre transmissão progressiva e geração incremental, com controles vocais testados e limites documentados. | Alta |
