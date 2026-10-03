# API

## Modelo reserva do Gemini

A configuração `llm.fallbackModel` em `PUT /v1/providers` define um único modelo reserva. Nesta instalação local, durante os testes de conversa: principal `gemini-3.6-flash`, reserva `gemini-3.8-flash`. A ordem foi invertida temporariamente após falhas de cota no 3.8 e uma medição bem-sucedida com o 3.6; não indica que o ensaio de latência já foi aceito. Ambos usam a variável de chave do adaptador e a mesma política de dados; a configuração permanece no banco local. Encerre chamadas antes de alterar os provedores.

A reserva é tentada uma vez quando o principal retorna HTTP 502, 503 ou 504, antes de entregar qualquer chunk. Cota (429), erro de chave/permissão, cancelamento, resposta parcial e falha de persistência não iniciam reserva. Cada tentativa verifica política e orçamento, reserva seu uso e registra o resultado por modelo. `GET /v1/usage` mostra `model` e `isFallback`; o log `provider.fallback` informa os modelos da troca sem chave nem conteúdo.

A disponibilidade depende do provedor; o reserva também pode falhar. O principal é tentado novamente no próximo turno. A troca não ativa faturamento nem muda a conta Google; modelos com camada gratuita continuam sujeitos aos limites e à configuração de faturamento do projeto. Remova `fallbackModel` para desativar o mecanismo.

## Conversa e diagnóstico de voz

`llm.thinkingLevel` configura o raciocínio do Gemini (`low`, `medium`, `high`). A instalação usa `low` para principal e reserva; isso reduz o esforço de raciocínio, mas não garante latência nem disponibilidade. A resposta falada é orientada a uma ou duas frases por padrão.

O STT retorna `NO_SPEECH_DETECTED` para áudio válido sem fala. A chamada volta a `idle`, contabiliza `noSpeech` e não mostra erro de indisponibilidade. Erros reais de validação continuam visíveis. HTTP 429 dos serviços locais significa inferência ocupada; 400 significa entrada recusada. O VAD exige 80 ms acima do limiar antes de abrir um turno, preservando 100 ms anteriores à fala.

Os serviços locais têm limite operacional de 500 pedidos diários nesta instalação. O orçamento estimado do STT é 50 milhões de unidades e o do TTS é 500 mil; a estimativa conservadora inclui o tamanho do áudio e não corresponde a cobrança do Google. Isso permite o ensaio de 100 turnos, inclusive segmentos TTS e áudio descartado. Os limites locais e remotos do Gemini permanecem separados.
