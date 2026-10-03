# Cliente técnico de chamadas

Módulo JavaScript independente e sem interface visual. Não importa código do backend nem introduz um pacote `shared`. Requer navegador com AudioWorklet/Web Audio, localhost ou HTTPS, autorização do microfone e um gesto do usuário para iniciar áudio.

`createCallClient` cria conversa/ticket, negocia protocolo 1.1 e disponibiliza `text`, `startMicrophone`, `stopMicrophone`, `interrupt` e `close`. A credencial da API é usada para obter o ticket; a chave Gemini permanece no backend. Trate a credencial da API como um segredo de uso pessoal e não a publique numa página distribuída.

O microfone pede AEC, redução de ruído e ganho automático. O worklet reduz áudio de 48 kHz para PCM de 16 kHz em quadros de 20 ms. O VAD usa energia RMS, pre-roll de 100 ms e silêncio final de 600 ms; precisa de calibração no dispositivo real. Uma fala contínua é dividida em no máximo 30 s por turno.

A reprodução valida metadados e sequência, agenda Web Audio e confirma amostras realmente reproduzidas a cada 500 ms. A interrupção para e descarta a fila local antes de avisar o servidor. A fila é limitada a 90 s. Apenas segmentos totalmente confirmados entram como resposta ouvida no contexto seguinte.

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

O coletor exige 100 turnos e 30 interrupções para avaliar suas metas. Mede o agendamento de áudio, incluindo o silêncio do VAD, e a parada local. Não confirma sozinho latência audível física, AEC efetivo ou aceite de hardware. Não foram produzidos resultados artificiais para essas metas.

Testes independentes da API:

```powershell
node --test code/frontend/call-client/tests/*.test.mjs
```
