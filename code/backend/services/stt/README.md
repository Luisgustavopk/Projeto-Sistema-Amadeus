# STT

Motor: faster-whisper, pt-BR, PCM mono de 16 kHz, duração entre 100 ms e 30 s. Cada pedido HTTP transcreve um buffer PCM completo. A API pode enviar snapshots durante a captura para reconhecer palavras e decidir interrupção; o motor continua sem streaming nativo. O filtro VAD do Whisper complementa o detector do cliente.

GET `/metrics` autenticado informa modelo, dispositivo, aquecimento, tempo de transcrição, duração do áudio e fator de tempo real da última execução.

## Dispositivo e configuração local

Compare CPU e GPU no hardware real: CUDA divide os 8 GB de VRAM com o Qwen e não é ativado automaticamente. Na máquina local, a comparação com o mesmo WAV de 4,4 s mostrou aproximadamente 1,55–1,61 s em CPU/int8 e 0,15–0,16 s em CUDA/int8_float16 após aquecimento, com a mesma transcrição. Esse resultado permitiu ativar CUDA no `.env` local. Essas medições pontuais não substituem os 100 turnos com microfone.

O aquecimento CUDA ocorre durante startup. Em Windows, `STT_CUDA_LIBRARY_DIRECTORY` pode apontar para as DLLs cuBLAS/cuDNN já instaladas; o arquivo de exemplo mantém CPU como alternativa. Na máquina atual, a pasta usada é `code/backend/tools/voice-design/.venv/Lib/site-packages/torch/lib`, configurada por caminho absoluto no `.env` local.

Configuração, instalação e comandos estão em [Serviços locais](../README.md).
