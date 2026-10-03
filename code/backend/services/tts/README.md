# TTS

Motor aprovado provisoriamente: Qwen3-TTS Base 1.7B, com áudio e transcrição da referência. Chatterbox permanece disponível com `TTS_ENGINE=chatterbox` e suas dependências próprias. A aprovação de qualidade veio da escuta do usuário; o refinamento vocal fica na fase 2.

## Qwen Base

Use um ambiente separado das dependências do Chatterbox. Em `code/backend/services/tts`, instale PyTorch compatível com sua GPU e depois `pip install -r requirements-qwen.txt`. A configuração testada usa Python 3.12, PyTorch 2.6.0+cu124, Transformers 4.57.3 e qwen-tts 0.1.1.

Em `tts/.env`, configure `TTS_ENGINE=qwen-base`, `TTS_DEVICE=cuda:0` e preserve o `SERVICE_ACCESS_TOKEN`. O modelo local fica, por padrão, em `backend/api/data/models/qwen3-tts-base-1.7b`. Foi testada a revisão `fd4b254389122332181a7c3db7f27e918eec64e3` de `Qwen/Qwen3-TTS-12Hz-1.7B-Base`. O adaptador carrega pesos locais e usa SDPA, sem exigir FlashAttention. CUDA indisponível gera erro explícito; não há troca silenciosa para CPU.

Ao lado de `references/amadeus.wav`, mantenha um arquivo local `amadeus.json`:

```json
{
  "referenceSha256": "SHA-256 do WAV",
  "transcript": "Transcrição exata da fala no WAV"
}
```

Áudio e JSON ficam fora do Git. Se trocar o WAV, atualize a transcrição e o hash no JSON e recadastre o perfil na API. A transcrição inicial foi automática e ainda precisa de conferência humana.

Com `QWEN_WARMUP_REFERENCE=amadeus.wav`, o contexto e uma síntese de aquecimento são preparados durante a inicialização, antes de aceitar pedidos. Sem essa opção, a preparação acontece no primeiro pedido. O contexto é reutilizado enquanto áudio e transcrição permanecerem iguais. A síntese usa texto completo, idioma `Portuguese` e até 512 novos tokens. O idioma do modelo, sozinho, não garante sotaque brasileiro: a avaliação depende da escuta.

Cada pedido aceita até 220 caracteres e devolve PCM16 mono de 16 kHz, mantendo o contrato público. GET `/metrics` autenticado informa tempo de preparação, geração, execução, duração de áudio e reutilização do contexto. Essas medidas são do TTS e não representam a latência total de uma chamada.

## Executar e testar

Em `code/backend/services`, use o Python do ambiente preparado para Qwen:

```powershell
.\tts\.venv-qwen\Scripts\python.exe -m uvicorn tts.app:app --env-file tts/.env --host 127.0.0.1 --port 8002
```

Crie `.venv-qwen` com Python 3.11 ou 3.12 antes de instalar as dependências. Neste computador, as audições utilizaram o ambiente já existente `backend/tools/voice-design/.venv`; o comando equivalente, a partir de `services`, é:

```powershell
..\tools\voice-design\.venv\Scripts\python.exe -m uvicorn tts.app:app --env-file tts/.env --host 127.0.0.1 --port 8002
```

Mantenha somente um processo TTS na porta 8002. Com API e TTS rodando, execute `npm run check:tts` em `backend/api`. Configuração de autenticação e demais comandos: [Serviços locais](../README.md).


## Latência e aceleração CUDA

`QWEN_CUDA_GRAPHS=true` acelera as etapas fixas do preditor de códigos e a decodificação de um token. O filtro de tokens proibidos é preparado uma vez por pedido. O cache de atenção é zerado a cada novo segmento; entradas que excedem sua capacidade seguem o caminho padrão. O serviço continua serializando as inferências. Os pesos, a referência, o idioma e os parâmetros de amostragem são preservados, mas operações BF16 com cache preenchido até tamanho fixo podem produzir diferenças numéricas e áudio não idêntico bit a bit.

A aceleração está restrita às versões verificadas: PyTorch 2.6.0, Transformers 4.57.3 e qwen-tts 0.1.1. Ela usa CUDA Graphs e SDPA, sem instalar Triton ou alterar o código dos pacotes. Para usar outro runtime, configure `QWEN_CUDA_GRAPHS=false` até validá-lo. Referência técnica: [CUDA Graphs no PyTorch](https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-graphs).

O benchmark local de 03/10/2026 comparou três frases e três sementes por modo na RTX 4060 de 8 GB, após aquecimento. A mediana geral passou de 7.18 s para 1.82 s; o fator de tempo real mediano ficou em 0.62. Esses nove testes por modo medem apenas TTS e não substituem os 100 turnos de aceite com STT, LLM e reprodução no cliente. O TTS ainda entrega cada segmento completo; não anuncia streaming nativo.

Para repetir, em `code/backend/tools/voice-design`:

```powershell
.\.venv\Scripts\python.exe benchmark_qwen.py --mode standard
.\.venv\Scripts\python.exe benchmark_qwen.py --mode accelerated
.\.venv\Scripts\python.exe validate_qwen_acceleration.py
```

Os resultados e WAVs ficam em `backend/api/data/voice-tests/latency-analysis`, fora do Git. GET `/metrics` inclui `cudaGraphs`, `warmupSeconds` e os tempos do último pedido; o aquecimento não conta como pedido do usuário. A API também registra `llmFirstSpeechSegment`, separando espera pelo primeiro trecho falável da duração total do LLM.

### Consistência da síntese Qwen

`QWEN_SYNTHESIS_SEED` (padrão `42`) fixa a semente por segmento para reproduzir a configuração das amostras aprovadas. O gerador aleatório é restaurado após a síntese. Os demais parâmetros de amostragem permanecem os do modelo; não foram aplicados filtros de timbre ou alterações de pitch. `/metrics` informa `synthesisSeed`. Reinicie o serviço após atualizar o código.

Isso reduz variação aleatória; não garante timbre idêntico à referência, continuidade de entonação entre frases nem sotaque aprovado. A validação depende da escuta de novas frases.
