# Llama emocional v4 — ensaio controlado com saldo herdado

Roteiro aprovado pelo usuário em 08/10/2026. Os commits 639384b, aa5d745 e d446bbf registram atuação, roteiro e documentação antes das correções desta rodada.

## Correção comum

O evento de iniciativa agora usa `presence-turn-v2.md`, sem exemplos de pendências específicas. Uma janela de até três turnos reais da pessoa, limitada em caracteres, é fornecida como `presence_anchor`. A janela distingue texto enviado e áudio confirmado, exclui eventos da aplicação e não interpreta assunto, idioma ou emoção por palavras-chave. É evidência de contexto, não garantia de que o modelo a usará corretamente. Ficção e assuntos recusados continuam dependendo da interpretação do histórico.

O processamento normal envia essa âncora e o build copia o Markdown correspondente. A versão de persona é 0.4.22. Os arquivos antigos e relatórios concluídos permanecem preservados.

## Desenho

Apenas Llama 3.3 70B, rota fixa DeepInfra Turbo via OpenRouter. Antes da primeira inferência, verificar disponibilidade e preços, com teto de US$ 0,10/M entrada e US$ 0,32/M saída. Sem fallback de rota, STT, TTS, dados pessoais ou juiz pago.

Os dois braços mantêm ficha curta, dez exemplos de estilo, complemento positivo de presença, cabeçalho expressivo e memória canônica. O braço `before` usa esse candidato anterior; `after` acrescenta apenas o complemento expressivo aprovado. A correção de iniciativa é comum aos dois. O experimento não compara versões completas de produção nem mede o efeito da compactação do complemento de presença. Temperatura 0,6, máximo de 512 tokens e verificador factual simulado iguais.

Dez conversas terão três amostras por braço: apelido Christina, papel de assistente, apelido inédito, insinuação, elogio técnico, elogio pessoal, tristeza, alegria, ironia e iniciativa. São 120 turnos por braço, alternando a ordem antes/depois ao longo da execução. As outras catorze conversas terão uma amostra do candidato, para cobertura: 56 turnos. Total: **296 turnos em 74 conversas**.

O primeiro pedido de cada par deverá diferir apenas pelo complemento expressivo. Depois disso, cada braço segue suas próprias respostas anteriores; diferenças posteriores incluem os efeitos desse histórico. Três amostras são diagnóstico inicial, não estabilidade demonstrada. O roteiro é desenvolvimento conhecido, não reservado.

## Orçamento

O executor lê o registro da rodada emocional anterior e usa **o mesmo ledger, teto agregado de US$ 0,25 e bloqueio exclusivo**. O gasto anterior, US$ 0,0917613784, continua contabilizado; saldo inicial US$ 0,1582386216. Relatório e manifesto novos ficam num diretório separado. Nenhum teto novo é criado.

Antes de cada chamada, a reserva conservadora é persistida; custos desconhecidos continuam consumindo margem. Alteração de saldo entre preparação e bloqueio, preço acima do teto, autenticação, rate limit ou orçamento esgotado interrompem a execução. O saldo é limite máximo, não obrigação de gastar tudo. A estimativa inicial sem cache é US$ 0,1523808, calculada com 4.700 tokens de entrada e 140 de saída por turno; não é garantia de consumo.

Comando da API: `npm run eval:llama-emotions -- --remaining-budget --run`. Sem `--run`, apenas preparar e informar estimativa. Reexecução de um relatório existente é bloqueada. A execução anterior não é reescrita.

Após uma interrupção por HTTP 429, `--resume` permite continuar usando o mesmo ledger e manifesto original, respeitando `retry-after`. As conversas completas são preservadas; uma conversa interrompida é arquivada e recomeça em uma tentativa separada. Chamadas descartadas da comparação continuam contabilizadas, inclusive reservas sem custo remoto informado. A estimativa da retomada considera apenas os jobs restantes. Prompts, fontes, modelo, rota, amostragem e desenho são comparados com o manifesto antes de inferir; mudanças do executor ficam registradas por época de execução. Há uma pausa de dois segundos entre os pedidos da retomada, fora das medições de latência do turno.

`audit-llama-emotional-v4.mjs` confere offline a ligação de todas as chamadas, incluindo as interrupções, e reconcilia o gasto desde o saldo original. O snapshot de orçamento do último processo não representa sozinho o número acumulado de chamadas sem custo informado. A auditoria financeira usa todos os registros, sem liberar reservas incertas.

## Relatórios

Separar comparação dos pares completos, todas as tentativas e cobertura sem controle. Gerar 120 fichas A/B com braço e amostra ocultos, além de 56 falas de cobertura. Notas humanas permanecem vazias; diagnóstico do agente é identificado como tal.

Medir primeiro conteúdo bruto, primeiro texto de fala e liberação; palavras, perguntas, tamanho e formato. Micro pausas e marcadores lexicais de atendimento são observações de avaliação, nunca veto no runtime ou aprovação automática. Auditar presença do complemento, equivalência inicial, âncora, índices e ausência de critérios nos pedidos. Semântica factual, persona e realização vocal não são comprovadas pela auditoria estrutural.
