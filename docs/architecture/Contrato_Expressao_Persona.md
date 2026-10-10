# Contrato de expressão da persona

Versão kurisu-amadeus-0.4.23, 08/10/2026. Catálogo ampliado por solicitação do usuário: 39 intenções e 50 emoções.

A fonte executável é src/domain/persona/expression.ts. Todos os prompts atuais derivam dela: saída vocal, prompt completo e experimento compacto. Labels são identificadores em português sem acentos. O objeto continua estrito: intent, emotion e intensity; metadados de memória possuem validação separada.

## Intensidade

Número contínuo entre 0 e 1, inclusive: 0 ausente, 0,25 sutil, 0,5 perceptível, 0,75 forte e 1 máxima. Não há mais teto de 0,7 nem limitação automática de 0,2 por turno. A reação imediata válida é preservada, inclusive se repete ou muda após reparo. Valores não numéricos, infinitos, negativos ou superiores a 1 são inválidos.

A intensidade descreve atuação; não é volume do áudio. O estado persistente PAD continua com atualização gradual, deduplicação por resposta e decaimento temporal, separado da reação imediata. Seus alvos são heurísticas artísticas, não medições psicológicas ou fatos sobre o usuário.

## Intenções

- conversar
- explorar
- corrigir
- discordar
- provocacao_afetuosa
- agradecer
- acolher
- corrigir_se
- admitir_limite
- retomar
- ceder_turno
- limitar
- esclarecer
- compartilhar
- brincadeira
- ironizar
- questionar
- refletir
- explicar
- argumentar
- concordar
- ponderar
- sugerir
- recomendar
- celebrar
- elogiar
- encorajar
- consolar
- tranquilizar
- demonstrar_afeto
- desabafar
- reagir
- desculpar_se
- reconciliar
- recusar
- negociar
- alertar
- cumprimentar
- despedir_se

## Emoções e apresentação

O rótulo semântico é preservado mesmo quando o TTS ou rig não possui controle específico. A apresentação usa os quatro presets e três identificadores visuais já disponíveis; deliveryApplied continua false. Ampliar o catálogo não comprova execução emocional pela voz/avatar.

| Emoção               | Direção visual desejada | Direção vocal desejada | Preset disponível  |
| -------------------- | ----------------------- | ---------------------- | ------------------ |
| neutra               | neutra                  | claro                  | neutro_claro_v1    |
| curiosidade          | atenta                  | interessado            | neutro_claro_v1    |
| firmeza_calma        | seria                   | firme-contido          | neutro_claro_v1    |
| ironia_leve          | sorriso-discreto        | seco-suave             | seco_suave_v1      |
| irritacao_leve       | contrariada             | firme-contido          | neutro_claro_v1    |
| constrangimento_leve | reserva-discreta        | hesitacao-breve        | hesitante_baixo_v1 |
| preocupacao          | atenta-seria            | acolhedor-calmo        | acolhedor_calmo_v1 |
| autocritica_leve     | seria                   | direto-contido         | neutro_claro_v1    |
| calor_discreto       | suave                   | calor-contido          | neutro_claro_v1    |
| alegria_discreta     | sorriso-discreto        | alegria-contida        | neutro_claro_v1    |
| alegria              | alegre                  | alegre                 | neutro_claro_v1    |
| entusiasmo           | animada                 | energico               | neutro_claro_v1    |
| divertimento         | divertida               | brincalhao             | seco_suave_v1      |
| orgulho              | orgulhosa               | seguro                 | neutro_claro_v1    |
| satisfacao           | satisfeita              | satisfeito             | neutro_claro_v1    |
| gratidao             | grata                   | calor-contido          | acolhedor_calmo_v1 |
| afeto                | afetuosa                | caloroso               | acolhedor_calmo_v1 |
| ternura              | terna                   | suave                  | acolhedor_calmo_v1 |
| esperanca            | esperancosa             | encorajador            | neutro_claro_v1    |
| alivio               | aliviada                | relaxado               | acolhedor_calmo_v1 |
| serenidade           | serena                  | calmo                  | acolhedor_calmo_v1 |
| surpresa             | surpresa                | surpreso               | neutro_claro_v1    |
| espanto              | espantada               | espantado              | neutro_claro_v1    |
| admiracao            | admirada                | admirado               | neutro_claro_v1    |
| interesse            | atenta                  | interessado            | neutro_claro_v1    |
| duvida               | questionadora           | ponderado              | hesitante_baixo_v1 |
| confusao             | confusa                 | incerto                | hesitante_baixo_v1 |
| ceticismo            | cetica                  | seco-suave             | seco_suave_v1      |
| hesitacao            | hesitante               | hesitacao-breve        | hesitante_baixo_v1 |
| constrangimento      | constrangida            | hesitante              | hesitante_baixo_v1 |
| vergonha             | envergonhada            | reservado              | hesitante_baixo_v1 |
| vulnerabilidade      | vulneravel              | baixo-sincero          | hesitante_baixo_v1 |
| saudade              | saudosa                 | suave-reflexivo        | acolhedor_calmo_v1 |
| nostalgia            | nostalgica              | reflexivo              | acolhedor_calmo_v1 |
| tristeza             | triste                  | baixo-contido          | acolhedor_calmo_v1 |
| melancolia           | melancolica             | reflexivo-baixo        | acolhedor_calmo_v1 |
| decepcao             | decepcionada            | desapontado            | neutro_claro_v1    |
| frustracao           | frustrada               | tenso-contido          | seco_suave_v1      |
| irritacao            | irritada                | seco-firme             | seco_suave_v1      |
| raiva                | brava                   | firme-intenso          | seco_suave_v1      |
| indignacao           | indignada               | firme-enfatico         | seco_suave_v1      |
| impaciencia          | impaciente              | curto-seco             | seco_suave_v1      |
| desanimo             | desanimada              | baixo                  | neutro_claro_v1    |
| tedio                | entediada               | pouca-energia          | neutro_claro_v1    |
| cansaco              | cansada                 | baixo-lento            | neutro_claro_v1    |
| apreensao            | apreensiva              | tenso                  | hesitante_baixo_v1 |
| medo                 | assustada               | tenso-baixo            | hesitante_baixo_v1 |
| inseguranca          | insegura                | incerto                | hesitante_baixo_v1 |
| arrependimento       | arrependida             | sincero-baixo          | acolhedor_calmo_v1 |
| culpa                | culpada                 | baixo-sincero          | hesitante_baixo_v1 |

## Política contextual e compatibilidade

Intenção não força emoção: preocupação pode acompanhar um alerta, brincadeira pode revelar orgulho ou constrangimento, e ironia consecutiva não é neutralizada apenas por repetição. O gerador recebe histórico e direções para avaliar reciprocidade, sofrimento, insistência e desculpas; o código valida estrutura e faixa sem inferir intenção por palavras. Preservar combinações não garante que cada proposta seja adequada: isso continua sujeito à avaliação contextual.

Os valores anteriores seguem aceitos. JSON inválido ou label fora do catálogo ainda usa o fallback neutro; não foram introduzidos aliases por palavra nem reconhecimento de emoções por regex. Novos labels possuem mapeamento PAD e apresentação centralizados para evitar falhas de persistência ou avaliação.

O limite local do prompt vocal passa de 12.500 para 14.000 caracteres para comportar o catálogo explícito, sem truncar referências da persona. Comprimento atual do prompt padrão: 13192 caracteres. Não muda max_tokens, modelo, rota nem limites financeiros.

## Validação

Testes locais cobrem streaming em qualquer fronteira do cabeçalho, preservação de brincadeira/orgulho/intensidade 1 até o protocolo, escalada e recomposição, vocabulário sincronizado nos prompts e persistência gradual de todas as emoções. A integração vocal usa provedores simulados; nenhuma chamada paga ou Cartesia é necessária. Não reaproveitar os resultados congelados da rodada anterior como evidência desta versão: contrato e política mudaram.
