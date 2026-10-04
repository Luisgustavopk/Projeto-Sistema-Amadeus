# Cliente técnico de chamadas

Módulo JavaScript independente e sem interface visual. Não importa código do backend nem introduz um pacote `shared`. Requer navegador com AudioWorklet/Web Audio, localhost ou HTTPS, autorização do microfone e um gesto do usuário para iniciar áudio.

`createCallClient` cria conversa/ticket, negocia protocolo 1.1 e disponibiliza `text`, `startMicrophone`, `stopMicrophone`, `interrupt` e `close`. A credencial da API é usada para obter o ticket; a chave Gemini permanece no backend. Trate a credencial da API como um segredo de uso pessoal e não a publique numa página distribuída.

O microfone pede AEC, redução de ruído e ganho automático. O worklet reduz áudio de 48 kHz para PCM de 16 kHz em quadros de 20 ms. O VAD usa energia RMS, pre-roll de 160 ms, limiar de 0,025 e 160 ms de confirmação de início; ele inicia a captura, mas não interrompe a reprodução. O cliente mantém a resposta atual enquanto envia o áudio ao STT e só a interrompe quando o STT reconhece palavras, por `transcript.partial` durante a captura ou `transcript.final` ao final. Se o STT não reconhecer fala ou falhar, a resposta atual continua. Isso evita cortes por ruído, mas o barge-in passa a esperar a latência do STT antes de silenciar. Rajadas menores ou ruído sustentado abaixo do limiar não iniciam captura; fala baixa demais pode não ser detectada. O silêncio final é de 300 ms. Uma fala contínua é dividida em no máximo 30 s por turno.

A reprodução valida metadados e sequência, agenda Web Audio e confirma amostras realmente reproduzidas a cada 500 ms. A interrupção para e descarta a fila local antes de avisar o servidor. A fila é limitada a 90 s. Apenas segmentos totalmente confirmados entram como resposta ouvida no contexto seguinte.

Quando a saída de áudio precisa ser retomada, metadados, quadros PCM e controles preservam a ordem de chegada na mesma fila. O limite durante a retomada é de 4 MiB e o prazo de retomada é de 5 s. `connection.closed` informa código, motivo e `wasClean`; 1012 indica reinicialização da API e 1006 indica perda da conexão sem encerramento confirmado. `npm run dev` reinicia a API após alterações no código e encerra as chamadas existentes; os ensaios contínuos podem usar `npm run build` e `npm start`.

## Integração

```javascript
import { createCallClient } from "./index.mjs";
import { createVoiceBaseline } from "./baseline.mjs";

const baseline = createVoiceBaseline();
// Execute em um gesto do usuário em um host local/HTTPS autorizado na API.
const call = await createCallClient({
  apiUrl: "http://127.0.0.1:3001",
  credential: "<credencial da API>",
  dataClass: "personal",
  onEvent: (event) => console.log(event),
  onError: (error) => console.error(error),
  onTiming: (sample) => baseline.record(sample),
});
await call.startMicrophone();
// call.interrupt(); call.text('Olá'); await call.close();
// baseline.summary();
```

O módulo precisa ser servido por HTTP; importar por `file://` não é suficiente. A interface temporária de testes está em `../voice-test`; consulte seu README para iniciar sem usar o console do navegador. A interface definitiva, Live2D e desktop permanecem nas fases previstas.

O coletor exige 100 respostas por voz e 30 interrupções automáticas durante reprodução. A resposta usa mediana até 2 s entre fim estimado da fala (detecção de fim menos silêncio final) e primeiro áudio agendado; p95 e máximo ficam registrados. A interrupção automática estima o intervalo entre detecção do VAD e parada local após reconhecimento de palavras pelo STT; p95 desejado até 500 ms. Paradas manuais e duração desde o início da fala são diagnósticos separados. Cada medição pertence ao turno confirmado, sem usar horários da captura seguinte ou contar respostas de texto. O agendamento e a parada local não confirmam saída física nem o atraso de detecção do VAD; hardwareAcceptanceConfirmed permanece false. Durante uma resposta ativa, a API tenta reconhecer palavras a partir de 800 ms de captura, com no máximo uma consulta antecipada por vez e espaçamento mínimo de 800 ms de áudio entre tentativas. Esse fluxo usa snapshots e não é streaming nativo do Whisper. O limite de 500 ms continua pendente: a janela inicial e o tempo de reconhecimento não garantem essa meta. A transcrição completa inicia o LLM apenas depois de speech.end.

Testes independentes da API:

```powershell
node --test code/frontend/call-client/tests/*.test.mjs
```
