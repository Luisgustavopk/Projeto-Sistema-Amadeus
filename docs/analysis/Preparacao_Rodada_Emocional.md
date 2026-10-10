# Preparação da próxima rodada emocional

## Checkpoint anterior

Antes das correções, as alterações existentes foram divididas em quatro commits, com Conventional Commits em pt-BR e sem corpo:

- `fd28e6e`: avaliação com rotas fixas e orçamento compartilhado.
- `a8ed12c`: avaliação isolada de atuação, memória e latência.
- `80aecb9`: roteiro emocional em português.
- `026ec9b`: análises e resultados das comparações.

As correções abaixo são posteriores a esse checkpoint. Não houve push ou execução paga nesta preparação.

## Correções anteriores à inferência

O histórico de estilo passa a considerar texto enviado, com origem explícita, sem convertê-lo em áudio confirmado. A familiaridade deriva de interações concluídas ou histórico elegível retido; falhas, iniciativas e reprodução parcial não aumentam o contador local. Texto disponível não comprova leitura, audição ou intimidade. Os contadores de texto e áudio confirmado permanecem distintos.

O veto lexical de aberturas foi substituído por observação de repetição. Estilo não lança erro de provedor e não provoca regeneração. A métrica de abertura repetida é diagnóstico, não prova de inadequação: uma repetição solicitada pode ser legítima. As validações estruturais, os limites de referências factuais e as permissões continuam ativos. A repercussão sobre naturalidade precisa ser medida; a retirada do veto não é uma aprovação de estilo.

As instruções vocais, a direção de memória e as demonstrações recuperadas em produção usam a forma canônica `memory:{"use":"none|context|recall","facts":[...]}`. O parser aceita as listas anteriores para compatibilidade. As demonstrações experimentais são normalizadas somente quando o novo braço ativa `canonicalMemory`; o banco original permanece intacto. Um índice existente comprova estrutura, não que a afirmação seja sustentada pelo fato. O caso Portal 2 continua requerendo revisão semântica independente.

O roteador de avaliação registra ID remoto antes de entregar conteúdo ao consumidor, status HTTP, recuo de `Retry-After` e motivo de cancelamento. Se recebeu `usage.cost`, contabiliza esse custo mesmo após cancelamento. Sem custo confirmado, preserva a reserva. Um erro 429 impede novas chamadas ao mesmo modelo dentro do roteador enquanto durar o recuo, sem reservar ou tentar novamente automaticamente. Essa correção pertence ao avaliador; não altera o fallback da conversa de produção.

O ID remoto permite investigar cobranças depois; a consulta automática de reconciliação ao OpenRouter não foi implementada nesta etapa. As reservas antigas sem IDs ou custo confirmado não foram liberadas. Nenhuma conclusão de cobrança zero foi inferida de erro HTTP.

O relatório comparativo usa a quantidade de turnos definida no cenário, em vez de três fixos. A ficha cega inclui o quarto turno; conversas incompletas continuam fora da comparação de conversas completas comuns. Tentativas e falhas são informadas separadamente.

## Roteiro e método

O [roteiro revisado](../../code/backend/evals/persona/quality-v3/personality-pt-BR.md) mantém 12 conversas de quatro turnos. O piloto emocional usa neutralidade, atenção pessoal, provocação/reconciliação e raiva por uma perda do usuário. São 16 turnos por modelo no piloto e 48 no roteiro completo; três autores exigem 48 ou 144 turnos, respectivamente, além de eventuais reparos.

PBR06 estabelece uma hipótese antes da pressão para concordar, permitindo observar uma posição anterior e a reação a dados novos. PBR04 insere um erro aritmético no histórico para medir reparo; não estima frequência de erros espontâneos. Cuidado, humor e firmeza são avaliados pelo contexto, sem emoção ou bordão obrigatórios.

O autor recebe fatos, histórico e falas. Expectativas, critérios e notas ficam separados. A fala é julgada com metadados ocultos; correspondência dos metadados é uma segunda revisão. Notas de outras IAs permanecem identificadas como diagnóstico. Esses cenários são desenvolvimento, não um novo conjunto reservado independente.

Essa rodada textual não certifica entonação, áudio, temporizadores de presença ou barge-in. O protótipo sem cabeçalho com memória, a seleção dinâmica de exemplos e o juiz semântico real precisam de braços próprios; não foram promovidos nesta preparação. Mantêm-se os exemplos fixos e o tempo de agrupamento de fala até medição específica.

## Preparação local e orçamento

Na pasta da API:

```powershell
npm run prepare:persona-emotions
```

O comando valida o roteiro, verifica sobreposição literal com os exemplos, separa dados do autor e critérios do avaliador e grava hashes de fontes e implementação em `data/refinement/emotional-preparation/plan.json`. Não lê chaves, não aceita `--run`, não gera respostas e não altera o ledger. O arquivo é preparação; um manifesto de execução ainda precisa fixar rotas verificadas, amostras, fatores e orçamento autorizado.

O saldo registrado da rodada anterior é **US$ 0,0025616312**, insuficiente para o roteiro completo. Não foi renovado o teto de US$ 0,25. Os hashes e relatórios históricos permanecem preservados; executores antigos devem rejeitar código diferente do congelado, em vez de reaproveitar silenciosamente a autorização anterior.

Antes de inferência: escolher piloto ou roteiro completo, verificar rotas e preços, autorizar teto da nova rodada e congelar o manifesto de execução. Depois: gerar fichas cegas em pt-BR, revisar atuação e continuidade, separar falhas de entrega e verificar semanticamente as afirmações sobre memória. A preparação local não aprova fidelidade à Kurisu.
