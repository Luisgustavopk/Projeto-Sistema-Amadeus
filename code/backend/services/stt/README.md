# STT

Motor: faster-whisper, pt-BR, PCM mono de 16 kHz, duração entre 100 ms e 30 s. Cada pedido HTTP transcreve um buffer PCM completo. A API pode enviar snapshots durante a captura para reconhecer palavras e decidir interrupção; o motor continua sem streaming nativo. O filtro VAD do Whisper complementa o detector do cliente.

GET `/metrics` autenticado informa modelo, dispositivo, aquecimento, tempo de transcrição, duração do áudio e fator de tempo real da última execução.

## Dispositivo e configuração local

Compare CPU e GPU no hardware real: CUDA divide os 8 GB de VRAM com o Qwen e não é ativado automaticamente. Na máquina local, a comparação com o mesmo WAV de 4,4 s mostrou aproximadamente 1,55–1,61 s em CPU/int8 e 0,15–0,16 s em CUDA/int8_float16 após aquecimento, com a mesma transcrição. Esse resultado permitiu ativar CUDA no `.env` local. Essas medições pontuais não substituem os 100 turnos com microfone.

O aquecimento CUDA ocorre durante startup. Em Windows, `STT_CUDA_LIBRARY_DIRECTORY` pode apontar para as DLLs cuBLAS/cuDNN já instaladas; o arquivo de exemplo mantém CPU como alternativa. Na máquina atual, a pasta usada é `code/backend/tools/voice-design/.venv/Lib/site-packages/torch/lib`, configurada por caminho absoluto no `.env` local.

Configuração, instalação e comandos estão em [Serviços locais](../README.md).

## Reconhecimento de conversa

O idioma fica fixado em português. "STT_BEAM_SIZE" controla quantas hipóteses o decoder compara (1 a 5, padrão 3). Temperatura zero mantém a decodificação determinística, e cada captura é transcrita sem condicionar a janelas anteriores. GET /metrics informa beamSize. Reinicie o STT para aplicar mudanças.

Beam maior pode aumentar o tempo; a melhoria de precisão precisa ser medida com as mesmas gravações e transcrições corretas. O modelo small permanece configurado: não foi baixado nem ativado um modelo maior. Whisper não garante a variante pt-BR nem transcrições corretas só por fixar o idioma. Compare primeiro erros por palavra e latência; depois avalie um modelo maior se necessário.

## Comparação com gravações fixas

Na interface de voz, encerre a chamada e abra **Comparação do reconhecimento de fala**. Grave a frase, pare, baixe o WAV e o manifesto na mesma pasta. Confira o áudio e o texto correto; marque a confirmação apenas após essa conferência. A gravação é manual, dura até 30 s e não é enviada à nuvem. Ela usa o mesmo worklet PCM da chamada, mas preserva a captura completa, sem os cortes do VAD. Isso ajuda a separar erro de captura/segmentação de erro do modelo.

Na pasta `code/backend/services`:

```powershell
.\stt\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\stt\.venv\Scripts\python.exe -m speech_eval.cli --manifest "C:/caminho/mic-123.json" --models small,medium --device cpu --compute-type int8 --runs 3 --output ../api/data/stt-evals/microfone-small-medium.json
```

A ferramenta mede erro por palavra (WER), latência de três execuções após aquecimento, duração, RMS, pico e saturação. Usa o mesmo áudio e parâmetros, carrega um modelo por vez e não muda o STT em execução. CPU é o padrão para não disputar VRAM com os serviços; comparar em CUDA exige margem de memória e a biblioteca cuDNN/cuBLAS configurada. Não compare tempos de CPU diretamente aos tempos do serviço em GPU. Para capturas reais, inclua frases em ritmo normal, baixa intensidade e com pausas; cada item do manifesto deve apontar para seu WAV e sua transcrição correta.

Teste sintético inicial: WAV de referência com transcrição automática não verificada, três repetições em CPU/int8, beam 3. `small`: mediana 1,68 s; `medium`: 4,61 s; ambos coincidiram com o texto de comparação. É somente um teste de funcionamento do comparador, sem comprovação de precisão no microfone do usuário. O serviço ativo continua `small` em CUDA/int8_float16. Relatório local: `api/data/stt-evals/smoke-small-medium.json`.
