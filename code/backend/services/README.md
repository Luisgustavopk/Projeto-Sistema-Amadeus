# Serviços locais de fala

STT usa faster-whisper e TTS oferece Qwen3-TTS Base, aprovado provisoriamente, e Chatterbox Multilingual, com referência de voz obrigatória. Veja [TTS](tts/README.md) para as dependências e o ambiente específico do Qwen. Cada serviço tem seu ambiente Python, modelo e processo. O pacote interno `speech_runtime` contém apenas contratos e transporte técnico comum; o frontend não o importa.

Use Python 3.11 ou 3.12. A primeira inicialização baixa pesos dos modelos; execute-a conscientemente, com espaço e memória disponíveis. Os testes automatizados usam motores controlados; audições locais também validaram inferência real do Qwen Base. Isso não comprova a meta de latência do fluxo completo.

## Instalar no Windows

Em `code/backend/services/stt`:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Para `tts`, siga o ambiente e o arquivo de dependências do motor escolhido em [TTS](tts/README.md). Configure um segredo aleatório distinto de pelo menos 32 caracteres em cada `SERVICE_ACCESS_TOKEN`. No ambiente da API, configure esses mesmos valores em `STT_SERVICE_TOKEN` e `TTS_SERVICE_TOKEN`. Os segredos não pertencem ao frontend nem ao Git.

Inicie os processos em terminais separados, ambos a partir de `code/backend/services`:

```powershell
.\stt\.venv\Scripts\python.exe -m uvicorn stt.app:app --env-file stt/.env --host 127.0.0.1 --port 8001
.\tts\.venv\Scripts\python.exe -m uvicorn tts.app:app --env-file tts/.env --host 127.0.0.1 --port 8002
```

Mantenha um worker por serviço: cada processo carrega uma cópia do modelo. Para GPU, prepare PyTorch/CTranslate2 compatíveis com seu ambiente e ajuste `TTS_DEVICE`, `STT_DEVICE` e `STT_COMPUTE_TYPE`. CPU não implica cumprimento da meta de dois segundos.

GET `/health`, GET `/metrics` e POST `/execute` exigem Bearer do serviço. A API usa o contrato publicado em `/v1/providers/protocol`. Cada processo executa uma inferência por vez e mantém no máximo uma requisição aguardando; requisições adicionais recebem 429. `/metrics` expõe `busy` e `queuedInferences`. A API cancela requisições e descarta resultados antigos, mas uma inferência local já iniciada pode continuar até terminar; a próxima chamada pode aguardar sua conclusão.

Enquanto uma requisição espera a inferência, o serviço verifica a desconexão do cliente a cada 100 ms. Uma espera cancelada é descartada com 499 e libera sua posição na fila; ela não inicia uma inferência obsoleta. O bloqueio continua pertencendo ao trabalho já iniciado até a thread terminar, evitando duas inferências simultâneas no mesmo motor.

As dependências de implantação têm versões/faixas declaradas; a árvore completa dos motores ainda precisa ser travada e validada na instalação real, principalmente PyTorch/CUDA. O `model` do payload local é metadado: a escolha efetiva do Whisper vem de `STT_MODEL`; o TTS usa o motor multilíngue carregado no processo.

## Ouvir um teste do TTS

Com a API e o TTS em execução, cadastre o perfil em `PUT /v1/voice/profile` e configure o provedor TTS na API. Em `code/backend/api`, execute:

```powershell
npm run check:tts
Invoke-Item .\data\voice-tests\teste-voz.wav
```

O comando sintetiza uma frase fixa com o perfil ativo e salva WAV PCM16, mono, 16 kHz. Uma nova execução substitui esse arquivo de teste. A referência original permanece preservada. É um diagnóstico direto do motor local: não usa Gemini/STT, não passa pelo orçamento do pipeline e não confirma reprodução no histórico. Para validar o fluxo completo, use o cliente de chamadas.

## Testes leves, sem pesos

```powershell
python -m pip install -r requirements-test.txt
$env:PYTHONPATH='.'
python -m pytest tests -q
```

Execute em um ambiente de testes isolado. Os testes cobrem autenticação, validação estrita, limites, erros sanitizados, integridade da referência e conversão PCM para STT.
