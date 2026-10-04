# Teste local de voz

Interface temporária da fase 1, independente da interface definitiva. Usa o cliente de chamadas da pasta vizinha sem importar código do backend. Não precisa instalar dependências.

## Iniciar

Mantenha API, STT e TTS em execução. No `.env` da API, inclua `http://127.0.0.1:8080,http://localhost:8080` em `ALLOWED_ORIGINS` (lista separada por vírgulas) e reinicie a API após alterar esse valor.

Na raiz do repositório:

```powershell
cd code/frontend/voice-test
npm run dev
```

Abra http://127.0.0.1:8080. A classificação começa em **Personal**; informe o `API_ACCESS_TOKEN` da API, clique em **Conectar** e depois em **Iniciar microfone**. A página consulta `/v1/capabilities`, mostra a política de cada reserva e bloqueia entrada pessoal se nenhum provedor LLM puder processá-la. A API exclui fallbacks sem aprovação antes de enviar conteúdo ou reservar uso. Revise os termos de cada provedor separadamente e configure `personal-approved`, `policyReviewedAt` e `policyReference` apenas nos provedores aprovados. Gemini exige `geminiTier: "paid"` e um plano pago elegível; sem isso, permanece inelegível para dados pessoais. Não altere as políticas apenas para fazer o teste.

**Synthetic** é reservado a entradas inteiramente artificiais e desabilita o microfone. Não selecione essa opção para disfarçar voz real, transcrições, mensagens ou dados pessoais. A chave do provedor permanece no backend; o token da API fica somente na memória da página.

## Testar

1. Confira **Verificar serviços**. LLM, STT e TTS devem estar disponíveis, e as políticas exibidas precisam permitir a classificação escolhida.
2. Em **Personal**, fale uma frase de teste não sensível, por exemplo: “Explique em uma frase o que é uma estrela”. Use apenas se a política do provedor autorizar dados pessoais. Aguarde a pausa de fim de fala. A transcrição aparece e o áudio da resposta toca automaticamente.
3. Durante a resposta, fale uma frase para testar a interrupção confirmada pelo STT. A resposta atual continua tocando durante a captura e só para quando o STT reconhece palavras, inclusive durante a captura; a prévia é exibida com reticências e substituída pela transcrição completa ao final; ruído ou áudio sem fala reconhecida não deve interrompê-la. Use também **Interromper resposta** para medir a parada local manual.
4. Use **Pausar microfone** para liberar a captura e parar a resposta atual; **Encerrar chamada** encerra a sessão. Mensagens por texto também geram respostas, mas não entram no tempo de resposta por voz.

Use uma única aba para conversar. Conectar outra aba substitui a chamada anterior; a anterior recebe código 4001, para o áudio e libera o microfone. A interface explica a substituição nos eventos de encerramento. O estado `Pronto` depende do fim da geração e da reprodução, sem perder confirmações que cheguem antes do fim do processamento. 5. Faça 100 turnos por voz e 30 interrupções automáticas enquanto a resposta está tocando. Exporte o JSON de medições. O botão manual é diagnóstico separado e não substitui o ensaio automático.

As medições pertencem a cada turno confirmado e estimam o fim da fala até o áudio agendado, incluindo silêncio final de 300 ms; a meta é mediana até 2 s em 100 turnos, com p95 e máximo registrados. O tempo desde o início detectado da pergunta é apenas diagnóstico. A coleta de interrupção automática exige 30 ocorrências durante reprodução, da detecção do VAD à parada local após STT, com meta p95 até 500 ms; não inclui o atraso anterior de confirmação de início de 160 ms nem confirma silêncio físico. A interrupção manual é contabilizada à parte. STT sem fala preserva a resposta. Há reconhecimento antecipado em snapshots a partir de 800 ms durante resposta ativa. A pergunta completa só é enviada ao LLM depois de speech.end. A janela inicial e o STT ainda não garantem a meta de 500 ms desde o início acústico. A coleta reúne sessões da página; recarregar começa uma coleta nova. Agendamento e parada local não comprovam AEC nem substituem medição física no hardware.

A API registra separadamente STT, primeiro token do LLM, primeira frase falável, TTS e envio dos quadros em GET `/v1/metrics`. Os serviços de fala expõem a última duração e o fator de tempo real em seus endpoints autenticados `/metrics`. Para comparar fases, use durações (não timestamps) e registre p50/p95 com pelo menos 100 turnos.

O relatório contém tempos e metadados de eventos; não inclui token, textos ou gravações. A conversa fica visível apenas na página. A classe selecionada é enviada em `session.start` e também registrada no histórico do backend. Conteúdo pessoal não é automaticamente sintético por ser uma frase fictícia.

Se a conexão falhar, confira token, origem permitida e terminal da API. Para `PROVIDER_UNAVAILABLE`, confira também o terminal do serviço correspondente. A interface não altera o perfil de voz nem configura os provedores.

## Verificar código

```powershell
npm test
node --test ../call-client/tests/*.test.mjs
```

`localhost` e `127.0.0.1` são origens diferentes para o navegador. O endereço permitido deve coincidir com a URL da página, incluindo a porta. Um `OPTIONS` com status 403 indica origem recusada antes da autenticação. Reinicie a API após editar seu `.env`.

## Amostra para comparar o STT

Reinicie `npm run dev` da interface e recarregue a página após atualizar a branch. O painel **Comparação do reconhecimento de fala** funciona sem conexão com a API. Encerre a chamada, clique em **Gravar amostra**, diga “Hum, então me conta uma história legal” e clique em **Parar**. Baixe o WAV e o manifesto na mesma pasta, conferindo que o texto corresponde ao que você disse.

A captura inteira fica apenas em memória nesta página até você baixar. Ela não entra no relatório normal de medições nem é enviada a provedores. Regravar substitui a amostra anterior. O limite é 30 s; a gravação usa PCM16 mono de 16 kHz e preserva a fala sem o VAD da chamada. O comparador local está documentado no README do STT.
