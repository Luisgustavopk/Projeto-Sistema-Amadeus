# Criação da voz original

Ferramenta local de criação e avaliação de candidatas. Qwen3-TTS VoiceDesign gera fala a partir de uma descrição; não recebe os MP3 das dubladoras como referência. As descrições ficam em `../../assets/voice-profiles/candidates.json` e as amostras geradas em `../../assets/voice-profiles/candidates/`, fora do Git.

Esse processo produz referências para avaliação. A identidade final depende da escuta e escolha do usuário. O suporte do modelo a português não garante sotaque brasileiro, boa pronúncia ou continuidade da identidade em outros motores; essas propriedades precisam ser verificadas.

## Correção do sotaque

A primeira rodada foi rejeitada na escuta por soar como português de Portugal. A segunda rodada usa `pt-br-tests.json`, instruções em português brasileiro, sementes diferentes e compara os modos `Portuguese` e `Auto`. O código `pt-BR` registra o requisito; o Qwen aceita somente o nome geral do idioma, sem um seletor dedicado de variante brasileira. A avaliação humana ainda é necessária.

```powershell
.\.venv\Scripts\python.exe generate.py --spec pt-br-tests.json --round pt-br-round-2
Invoke-Item ..\..\assets\voice-profiles\candidates\pt-br-round-2\br-portuguese.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\pt-br-round-2\br-auto.wav
```

## Ambiente Windows

Use um ambiente separado, Python 3.12 e uma GPU NVIDIA compatível com CUDA. A instalação abaixo usa PyTorch 2.6 com CUDA 12.4. Essa ferramenta não altera os ambientes STT/TTS.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe generate.py
```

O modelo tem revisão fixa. Os pesos e dependências exigem vários GB de disco. A GPU precisa ter memória disponível para o modelo e a geração; processos concorrentes influenciam essa disponibilidade. O gerador usa SDPA do PyTorch e não exige FlashAttention compilado no Windows.

Para gerar somente uma candidata:

```powershell
.\.venv\Scripts\python.exe generate.py --candidate b-calorosa
```

O gerador não substitui arquivos de candidatas existentes. Preserve ou mova a rodada anterior antes de gerar uma nova. O manifesto JSON registra descrição, texto, semente, revisão, versões e SHA-256. A semente ajuda a repetir o experimento, sem garantir áudio idêntico entre versões ou dispositivos.

## Escuta e seleção

```powershell
Invoke-Item ..\..\assets\voice-profiles\candidates\a-equilibrada.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\b-calorosa.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\c-firme.wav
```

Compare a frase inteira, sotaque, palavras omitidas, ruído, pausas, naturalidade, timbre e adequação à personalidade. As amostras usam o mesmo texto; cada arquivo representa uma candidata diferente. Os nomes expressam a direção pedida ao modelo, sem afirmar que ele a cumpriu.

Após a escolha, copie a referência aprovada para `references/` com um nome novo, encerre as chamadas e cadastre-a pela API. Gere frases novas no Chatterbox e compare com a referência: a qualidade da candidata não garante a mesma qualidade na síntese condicionada. A referência atual e o perfil ativo permanecem preservados durante a avaliação.

## Rodada 3 — direção baseada na Kurisu

As duas primeiras rodadas foram rejeitadas na escuta. A terceira compara duas direções adaptadas do script fornecido pelo usuário (base e cientista), cada uma com sementes 17 e 42. Consulte `../../assets/voice-profiles/voice-direction-round-3.md` para evidências, limitações, preferências e critérios de escolha.

```powershell
.\.venv\Scripts\python.exe analyze_references.py --source "$env:USERPROFILE\Downloads" --output ..\..\assets\voice-profiles\reference-analysis-round-3.json
.\.venv\Scripts\python.exe generate.py --spec kurisu-round-3.json --round kurisu-round-3
.\.venv\Scripts\python.exe validate_samples.py ..\..\assets\voice-profiles\candidates\kurisu-round-3
```

Esses comandos documentam a execução; a análise e a geração recusam substituir resultados existentes. Para reproduzir, escolha outro nome de relatório e de rodada. As dependências já estão no ambiente de criação. A transcrição usa o STT local em `127.0.0.1:8001` e lê `STT_SERVICE_TOKEN` do `.env` da API sem registrá-lo. Os áudios das referências permanecem locais. Se o STT estiver indisponível, a transcrição fica marcada como indisponível.

```powershell
Invoke-Item ..\..\assets\voice-profiles\candidates\kurisu-round-3\a-base-17.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\kurisu-round-3\a-base-42.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\kurisu-round-3\b-cientista-17.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\kurisu-round-3\b-cientista-42.wav
```

O relatório `quality-check.json` verifica integridade técnica e compara o reconhecimento automático com o texto esperado. Não aprova sotaque, timbre ou naturalidade. Se todas as quatro candidatas falharem no sotaque brasileiro, interrompa esta configuração; não abra outra rodada automaticamente. Os textos do teste de continuidade ficam em `design.json`, pendentes da seleção da candidata.

## Gemini Voice Design — rodada 1

O usuário autorizou experimentar a criação em nuvem após reprovar as candidatas do Qwen. `gemini-round-1.json` define três descrições originais, orientadas pelo material artístico do Claude, pelos intervalos analisados e pelo feedback da rodada anterior. A análise não inclui escuta de timbre pelo agente; a semelhança continua sendo uma avaliação humana.

```powershell
.\.venv\Scripts\python.exe generate_gemini.py
```

O gerador usa REST e lê `GEMINI_API_KEY` do `.env` local da API sem imprimir a chave. Cria vozes do tipo `prompted` com `language_code="pt-BR"` e sotaque brasileiro, preserva os IDs e sintetiza o mesmo texto com cada identidade. A API consultada rejeitou `prompted.region_code`; o idioma regional e a descrição de sotaque foram aceitos. Os MP3 das dubladoras continuam locais. Apenas descrições e texto de síntese foram enviados na criação; os áudios sintéticos resultantes foram enviados ao Gemini para conferência de transcrição.

As vozes são armazenadas no projeto Google, conforme exigido para Voice Design. As respostas de criação, IDs e previews ficam em `candidates/gemini-round-1/`, ignorado pelo Git. O comando recusa substituir amostras completas. Para retomar uma candidata incompleta, use `--candidate g1-equilibrada` (ou outro ID); a identidade já registrada é reutilizada.

A documentação consultada oferece uma faixa gratuita para `gemini-3.8-flash-tts`. A API não informa a faixa de faturamento da conta; este teste não comprova cobrança zero. Não há troca automática para outro modelo ou plano pago.

Os primeiros textos perderam acentos no transporte entre ferramentas e foram excluídos da avaliação, preservados em `rejected-input-encoding/`. As frases foram refeitas com texto UTF-8 correto. G1 e G2 reutilizam suas identidades, cujos prompts de criação ficaram registrados exatamente como enviados; G3 foi criada após a correção. Todos os três arquivos finais passaram pelos testes técnicos e tiveram as palavras reconhecidas corretamente pelo Gemini; o STT local estava indisponível. Essa conferência não valida sotaque, naturalidade ou identidade vocal.

```powershell
Invoke-Item ..\..\assets\voice-profiles\candidates\gemini-round-1\g1-equilibrada.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\gemini-round-1\g2-cientista.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\gemini-round-1\g3-expressiva.wav
```

## Gemini — análise sonora autorizada e rodada 2

Após nova autorização, trechos dos nove MP3 foram enviados para análise perceptiva, junto às três candidatas anteriores. A direção e suas limitações estão em `../../assets/voice-profiles/voice-direction-gemini-round-2.md`.

```powershell
.\.venv\Scripts\python.exe analyze_gemini_references.py --batch primary --model gemini-3-flash-preview
.\.venv\Scripts\python.exe analyze_gemini_references.py --batch support1 --model gemini-3-flash-preview
.\.venv\Scripts\python.exe analyze_gemini_references.py --batch support2 --model gemini-3-flash-preview
.\.venv\Scripts\python.exe analyze_gemini_references.py --batch support3 --model gemini-3-flash-preview
.\.venv\Scripts\python.exe analyze_gemini_references.py --assemble
.\.venv\Scripts\python.exe generate_gemini.py --spec gemini-round-2.json --round gemini-round-2
```

Os grupos já concluídos recusam substituição. O parâmetro `--from-response` permite validar uma resposta recebida e preservada sem fazer outro pedido de análise. As entradas têm hashes e intervalos; nenhum recorte é selecionado por suposto gênero ou identidade inferidos do pitch. Campos `referenceAudioUsedForConditioning=false` e `referenceAudioUploaded=true` distinguem análise autorizada de condicionamento vocal. A criação continua como `type="prompted"`.

```powershell
Invoke-Item ..\..\assets\voice-profiles\candidates\gemini-round-2\ga2-textura.wav
Invoke-Item ..\..\assets\voice-profiles\candidates\gemini-round-2\gb2-presenca.wav
```

## Fontes do Gemini

- [Voice Design](https://ai.google.dev/gemini-api/docs/voice-design)
- [API de vozes](https://ai.google.dev/api/voices)
- [Preços e faixa gratuita](https://ai.google.dev/gemini-api/docs/pricing)

## Fontes do Qwen

- [Modelo VoiceDesign e licença](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign)
- [Uso oficial do Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)
- [Instalação PyTorch 2.6](https://pytorch.org/get-started/previous-versions/)
