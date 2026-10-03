# Teste local de voz

Interface temporária da fase 1, independente da interface definitiva. Usa o cliente de chamadas da pasta vizinha sem importar código do backend. Não precisa instalar dependências.

## Iniciar

Mantenha API, STT e TTS em execução. No `.env` da API, inclua `http://127.0.0.1:5173,http://localhost:5173` em `ALLOWED_ORIGINS` (lista separada por vírgulas) e reinicie a API após alterar esse valor.

Na raiz do repositório:

```powershell
cd code/frontend/voice-test
npm run dev
```

Abra http://127.0.0.1:5173. Informe o `API_ACCESS_TOKEN` da API, clique em **Conectar** e depois em **Iniciar microfone**. Autorize o microfone e use fones. O token permanece na memória da página; a chave Gemini permanece no backend.

## Testar

1. Confira **Verificar serviços**. LLM, STT e TTS devem estar disponíveis.
2. Fale uma frase fictícia, por exemplo: “Explique em uma frase o que é uma estrela”. Aguarde a pausa de fim de fala. A transcrição aparece e o áudio da resposta toca automaticamente.
3. Durante a resposta, fale outra frase para testar a interrupção automática. Use também **Interromper resposta** para medir a parada local manual.
4. Use **Pausar microfone** para liberar a captura e parar a resposta atual; **Encerrar chamada** encerra a sessão. Mensagens por texto também geram respostas, mas não entram no tempo de resposta por voz.
5. Faça 100 turnos por voz e 30 interrupções manuais para a coleta prevista. Exporte o JSON de medições.

As medições estimam o intervalo entre o fim da fala e o agendamento do áudio no navegador, incluindo o VAD. Não confirmam sozinhas a saída audível física, o cancelamento no servidor ou a eficácia do cancelamento de eco. A coleta reúne as sessões desta página; recarregar começa uma coleta nova.

O relatório contém tempos e metadados de eventos; não inclui token, textos ou gravações. A conversa fica visível apenas na página. Os pedidos são classificados como `synthetic`: use conteúdo fictício, conforme a política do provedor configurado. O backend mantém seu próprio histórico segundo as regras do projeto.

Se a conexão falhar, confira token, origem permitida e terminal da API. Para `PROVIDER_UNAVAILABLE`, confira também o terminal do serviço correspondente. A interface não altera o perfil de voz nem configura os provedores.

## Verificar código

```powershell
npm test
node --test ../call-client/tests/*.test.mjs
```

`localhost` e `127.0.0.1` são origens diferentes para o navegador. O endereço permitido deve coincidir com a URL da página, incluindo a porta. Um `OPTIONS` com status 403 indica origem recusada antes da autenticação. Reinicie a API após editar seu `.env`.
