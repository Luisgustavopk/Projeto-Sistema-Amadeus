import { expect, it, vi } from 'vitest';
import { ActivityGate } from '../../src/application/runtime/activity-gate.ts';
import { createProviderConfiguration } from '../../src/application/providers/configuration.ts';
import { createCallAuthorization } from '../../src/application/calls/authorization.ts';
import { DEFAULT_PROVIDERS } from '../../src/domain/providers/model.ts';
import { createProvider } from '../../src/adapters/providers/http-json.ts';

function deferred() {
  let resolve: () => void = () => {};

  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

const origin = 'http://localhost:5173';
const input = { conversationId: 'conversation', ticket: 'unused', origin };

it('bloqueia novas chamadas e execuções enquanto salva a configuração', async () => {
  const pendingSave = deferred();
  const gate = new ActivityGate(1);
  const consume = vi.fn(async () => {});
  const calls = createCallAuthorization({ consume }, gate, [origin]);
  const configuration = createProviderConfiguration(
    { get: async () => DEFAULT_PROVIDERS, save: () => pendingSave.promise },
    'primary',
    (role, config) => createProvider(role, config, {}),
    gate,
  );
  const saving = configuration.configure(DEFAULT_PROVIDERS);

  try {
    await expect(calls.authorize(input)).rejects.toMatchObject({
      code: 'PROVIDER_BUSY',
    });
    expect(() => gate.beginExecution()).toThrow();
    expect(consume).not.toHaveBeenCalled();
    expect(gate.activeCalls).toBe(0);
  } finally {
    pendingSave.resolve();
    await saving;
  }

  const release = await calls.authorize(input);
  expect(consume).toHaveBeenCalledOnce();
  expect(gate.activeCalls).toBe(1);
  release();
  release();
  expect(gate.activeCalls).toBe(0);
});

it('reserva a vaga antes de validar o ticket e impede troca de configuração', async () => {
  const pendingTicket = deferred();
  const gate = new ActivityGate(1);
  const save = vi.fn(async () => {});
  const calls = createCallAuthorization(
    { consume: () => pendingTicket.promise },
    gate,
    [origin],
  );
  const configuration = createProviderConfiguration(
    { get: async () => DEFAULT_PROVIDERS, save },
    'primary',
    (role, config) => createProvider(role, config, {}),
    gate,
  );
  const authorizing = calls.authorize(input);

  try {
    await expect(
      configuration.configure(DEFAULT_PROVIDERS),
    ).rejects.toMatchObject({ code: 'PROVIDER_BUSY' });
    expect(save).not.toHaveBeenCalled();
  } finally {
    pendingTicket.resolve();
    const release = await authorizing;
    release();
  }

  await configuration.configure(DEFAULT_PROVIDERS);
  expect(save).toHaveBeenCalledOnce();
});

it('libera vagas e bloqueios quando falham o ticket ou a persistência', async () => {
  const gate = new ActivityGate(1);
  const calls = createCallAuthorization(
    {
      consume: async () => {
        throw new Error('invalid ticket');
      },
    },
    gate,
    [origin],
  );
  await expect(calls.authorize(input)).rejects.toThrow('invalid ticket');
  expect(gate.activeCalls).toBe(0);

  const configuration = createProviderConfiguration(
    {
      get: async () => DEFAULT_PROVIDERS,
      save: async () => {
        throw new Error('database failure');
      },
    },
    'primary',
    (role, config) => createProvider(role, config, {}),
    gate,
  );
  await expect(configuration.configure(DEFAULT_PROVIDERS)).rejects.toThrow(
    'database failure',
  );
  const release = gate.acquireCall();
  release();
  const finish = gate.beginExecution();
  finish();
});
