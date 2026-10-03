import { createCallClient } from '/call-client/index.mjs';
import { createVoiceBaseline } from '/call-client/baseline.mjs';
import { createTestReport } from './report.mjs';

const element = (id) => document.getElementById(id);
const baseline = createVoiceBaseline();
const report = createTestReport();
const responses = new Map();
const log = [];
let client;
let generation = 0;
let microphone = false;
let microphonePending = false;
let state = 'disconnected';

function showError(error) {
  element('error').textContent = error.message || 'Não foi possível completar a operação.';
  element('error').hidden = false;
}

function renderControls() {
  const connected = Boolean(client);
  const labels = { disconnected: 'Desconectado', connecting: 'Conectando…', idle: 'Pronto', listening: 'Ouvindo', thinking: 'Pensando', speaking: 'Falando', error: 'Erro na resposta' };
  element('status').textContent = labels[state] || state;
  element('status').dataset.active = String(connected);
  element('connect').disabled = connected || state === 'connecting';
  element('disconnect').disabled = !connected;
  element('api-url').disabled = connected || state === 'connecting';
  element('token').disabled = connected || state === 'connecting';
  element('microphone').disabled = !connected || microphonePending;
  element('microphone').textContent = microphone ? 'Pausar microfone' : 'Iniciar microfone';
  element('microphone-status').textContent = microphone ? 'Microfone ativo' : 'Microfone desligado';
  element('interrupt').disabled = !connected || !['thinking', 'speaking'].includes(state);
  element('text').disabled = !connected;
  element('send').disabled = !connected;
}

function message(role, text) {
  element('conversation').querySelector('.empty')?.remove();
  const node = document.createElement('p');
  node.className = 'message ' + role;
  node.textContent = (role === 'user' ? 'Você: ' : 'Amadeus: ') + text;
  element('conversation').append(node);
  while (element('conversation').children.length > 100) element('conversation').firstElementChild.remove();
  node.scrollIntoView({ block: 'nearest' });
  return node;
}

function receive(event) {
  report.event(event);
  log.push(JSON.stringify({ type: event.type, state: event.state, code: event.code, turnId: event.turnId }));
  if (log.length > 200) log.shift();
  element('events').textContent = log.join('\n');
  if (event.type === 'state') {
    state = event.state;
    if (state === 'thinking') element('error').hidden = true;
  }
  if (event.type === 'transcript.final') message('user', event.text);
  if (event.type === 'reply.text') {
    const key = event.responseId;
    let response = responses.get(key);
    if (!response) {
      response = { node: message('assistant', ''), segments: new Map() };
      responses.set(key, response);
      if (responses.size > 100) responses.delete(responses.keys().next().value);
    }
    response.segments.set(event.position, event.text);
    response.node.textContent = 'Amadeus: ' + [...response.segments].sort(([a], [b]) => a - b).map(([, text]) => text).join(' ');
  }
  if (event.type === 'error') {
    const message = event.code === 'PROVIDER_TEMPORARILY_UNAVAILABLE'
      ? 'O Gemini está temporariamente indisponível (HTTP 503). Aguarde e tente outra mensagem; sua conexão continua ativa.'
      : event.code === 'QUOTA_EXCEEDED' ? 'O limite de uso do provedor foi atingido. Confira a cota no Google AI Studio e os limites locais da API.'
      : event.code === 'PROVIDER_BUSY' ? 'O serviço de fala ainda está ocupado. Aguarde um momento e tente outra frase.'
      : 'Falha na resposta: ' + event.code + '. Confira o terminal da API e do serviço indicado.';
    showError(new Error(message));
  }
  if (event.type === 'connection.closed') {
    client = undefined;
    microphone = false;
    state = 'disconnected';
  }
  renderControls();
}

function timing(sample) {
  baseline.record(sample);
  report.timing(sample);
  const summary = baseline.summary();
  const format = (value) => value === null ? '—' : (value / 1000).toFixed(2) + ' s';
  if (sample.stage === 'firstAudioScheduled') element('last-time').textContent = format(sample.milliseconds);
  element('median').textContent = format(summary.firstAudioScheduled.medianMs);
  element('p95').textContent = format(summary.firstAudioScheduled.p95Ms);
  element('samples').textContent = summary.firstAudioScheduled.samples + ' / ' + summary.localInterruption.samples;
  element('baseline-status').textContent = summary.sufficientSample
    ? 'Coleta completa. Meta de mediana: ' + (summary.firstAudioTargetMet ? 'atingida' : 'acima de 2 s') + '; parada local: ' + (summary.interruptionTargetMet ? 'atingida' : 'acima de 500 ms') + '. Escuta, saída física e cancelamento no servidor ainda precisam de avaliação.'
    : 'Coleta: ' + summary.firstAudioScheduled.samples + '/100 turnos e ' + summary.localInterruption.samples + '/30 interrupções manuais. São estimativas do navegador.';
}

function settings() {
  const apiUrl = new URL(element('api-url').value);
  if (!['http:', 'https:'].includes(apiUrl.protocol) || !['127.0.0.1', 'localhost'].includes(apiUrl.hostname)) throw new Error('Use o endereço local da API: http://127.0.0.1:3001.');
  const credential = element('token').value.trim();
  if (!credential) throw new Error('Informe o API_ACCESS_TOKEN da API.');
  return { apiUrl: apiUrl.origin, credential, dataClass: 'synthetic' };
}

async function inspect() {
  element('error').hidden = true;
  element('inspect').disabled = true;
  try {
    const { apiUrl, credential } = settings();
    const response = await fetch(apiUrl + '/v1/health/details', { headers: { authorization: 'Bearer ' + credential }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Verificação recusada (HTTP ' + response.status + '). Confira o token e ALLOWED_ORIGINS da API.');
    const health = await response.json();
    element('providers').textContent = 'API: ' + health.api + ' · Banco: ' + health.database + ' · ' + health.providers.map((provider) => provider.role.toUpperCase() + ': ' + (provider.available ? 'disponível' : 'indisponível')).join(' · ');
  } catch (error) {
    showError(error instanceof TypeError ? new Error('Não foi possível acessar a API. Confira se ela está rodando e se ALLOWED_ORIGINS inclui http://127.0.0.1:5173.') : error);
  } finally {
    element('inspect').disabled = false;
  }
}

element('connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (client || state === 'connecting') return;
  element('error').hidden = true;
  const current = ++generation;
  try {
    const options = settings();
    state = 'connecting';
    renderControls();
    client = await createCallClient({ ...options, onEvent: (value) => { if (current === generation) receive(value); }, onTiming: timing, onError: (error) => { if (current === generation) showError(error); } });
    state = 'idle';
    receive(client.session);
    void inspect();
  } catch (error) {
    state = 'disconnected';
    showError(error instanceof TypeError ? new Error('Falha de conexão. Confira a API, o token e a origem permitida http://127.0.0.1:5173.') : error);
  }
  renderControls();
});

element('disconnect').addEventListener('click', async () => {
  const previous = client;
  generation++;
  client = undefined;
  microphone = false;
  state = 'disconnected';
  renderControls();
  try { await previous?.close(); } catch (error) { showError(error); }
});

element('microphone').addEventListener('click', async () => {
  const active = client;
  if (!active || microphonePending) return;
  microphonePending = true;
  renderControls();
  try {
    if (microphone) {
      active.stopMicrophone();
      microphone = false;
    } else {
      await active.startMicrophone();
      if (client === active) microphone = true;
      else active.stopMicrophone();
    }
  } catch (error) {
    showError(new Error('Não foi possível iniciar o microfone. Permita o acesso no navegador. ' + error.message));
  } finally {
    microphonePending = false;
    renderControls();
  }
});

element('interrupt').addEventListener('click', () => client?.interrupt());
element('inspect').addEventListener('click', inspect);
element('text-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = element('text').value.trim();
  if (!client || !text) return;
  client.text(text);
  message('user', text);
  element('text').value = '';
});
element('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report.snapshot(baseline.summary()), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'amadeus-teste-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => { void client?.close(); });
renderControls();
