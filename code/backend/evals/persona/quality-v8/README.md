# Atuação e latência — Llama e DeepSeek

Teto herdado, sem renovação: US$ 0,137070884 restantes da rodada de US$ 0,27. Toda chamada de autor, observador, juiz ou falha integra esse teto. Sem voz/Cartesia e sem fatos pessoais novos.

Três braços, na persona 0.4.23 e mesmo banco v7: baseline (recuperação por diálogo e exemplos como turnos), isolated (recuperação por função da interação e exemplos em bloco fictício separado), parallel (mesmo isolated, somente fala e classificador de expressão não bloqueante). Baseline→isolated testa o pacote de recuperação e fronteira, não seus fatores individualmente. Isolated→parallel testa a separação de metadados; não muda temperatura, limite de saída, rota, núcleo ou temporizador de segmentação.

Quatro conversas de desenvolvimento, duas amostras; duas reservadas, uma amostra. Mesmas entradas para Llama e DeepSeek, histórico gerado próprio em cada braço, ordem alternada. O resultado reservado não orienta ajustes nesta rodada. Cenários e implementações congelados antes das chamadas. Começar grupos completos apenas com margem de orçamento; parar em erro remoto, sem retries pagos automáticos.

Registrar primeiro conteúdo bruto, primeira fala e primeiro segmento validado, tempo da busca e metadados prontos. A expressão tardia não altera áudio passado. Este protótipo não libera fatos persistentes: a validação de memória não pode ser removida silenciosamente para ganhar latência. Seu uso em produção depende de uma integração própria e da validação textual, seguida da voz pelo usuário.

Jev: usar as preferências pessoais existentes como referência, corrigindo a distinção entre adequação conversacional, fidelidade e expressão. As novas fichas ainda não possuem notas pessoais: não fabricar referência humana. Rubrica e controles novos são candidatos; congelar antes de executar e reportar empates, ambas inadequadas e inversão A/B. Nenhum seletor em produção.
