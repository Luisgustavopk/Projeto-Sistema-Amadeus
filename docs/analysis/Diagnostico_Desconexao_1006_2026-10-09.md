# Desconexão no teste de voz — 09/10/2026

O registro fornecido termina com `connection.closed`, código **1006**, motivo vazio e `wasClean: false`. O último turno completou texto e áudio, enviou `reply.done` e voltou ao estado ocioso. Não aparece `QUOTA_EXCEEDED`, `RATE_LIMITED`, falha de síntese ou fechamento 1008 antes da queda.

1006 informa que o navegador não confirmou um encerramento normal do WebSocket; não identifica a causa original. O limite de 30 minutos da sessão usa 1000 com motivo próprio. Um erro de validação usa 1008, e o encerramento controlado da API usa 1012. Nenhum desses motivos foi recebido neste registro.

Na inspeção local, a API respondeu na porta 3001. A consulta aos processos confirmou execução do código-fonte com **`--watch`**. Mudanças nos arquivos carregados podem reiniciar a API e encerrar as chamadas em andamento. É um candidato concreto à interrupção durante desenvolvimento, não uma causa comprovada retroativamente: faltam timestamps e o log do terminal da API no instante da queda para distinguir reinício, encerramento abrupto e falha de transporte.

O teste de integração de reinicialização passou para os protocolos **1.0 e 1.1**, incluindo uma sessão de voz negociada: o fechamento controlado entregou **1012 / Service restart**. Não foi encontrada evidência suficiente para alterar o protocolo, as cotas ou a geração de respostas com base neste evento. Nenhuma inferência ou síntese paga foi executada nesta conferência.

Para testar conversas sem reinícios por alterações de arquivos, encerre a API em modo de desenvolvimento e execute, no diretório `code/backend/api`:

```powershell
npm run build
npm start
```

Recarregue a página e conecte novamente. Mudanças no código exigirão nova compilação e reinício manual nesse modo. Se a queda se repetir com a API estável, preserve o log do terminal junto do JSON exportado da interface e horário da ocorrência; o código 1006 isolado não permite concluir a causa.
