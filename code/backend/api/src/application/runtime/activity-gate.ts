import { ProviderBusyError } from '../../domain/errors/providers.ts';
import { ConnectionLimitError } from '../../domain/errors/calls.ts';
import type {
  ConfigurationGate,
  ExecutionGate,
  CallGate,
  ReleaseActivity,
} from '../../ports/activity-gate.ts';

export class ActivityGate
  implements ConfigurationGate, ExecutionGate, CallGate
{
  private executions = 0;
  private calls = 0;
  private configuring = false;
  private readonly maxCalls: number;

  constructor(maxCalls: number) {
    this.maxCalls = maxCalls;
  }

  get activeCalls() {
    return this.calls;
  }

  get activeExecutions() {
    return this.executions;
  }

  beginConfiguration(): ReleaseActivity {
    if (this.configuring || this.executions > 0 || this.calls > 0) {
      throw new ProviderBusyError(
        'Encerre as operações e conexões antes de trocar os adaptadores.',
      );
    }

    this.configuring = true;

    return this.once(() => {
      this.configuring = false;
    });
  }

  beginProviderConfiguration(): ReleaseActivity {
    if (this.configuring || this.executions > 0) {
      throw new ProviderBusyError(
        'Aguarde o turno atual antes de trocar os adaptadores.',
      );
    }

    this.configuring = true;

    return this.once(() => {
      this.configuring = false;
    });
  }

  beginExecution(): ReleaseActivity {
    this.assertNotConfiguring();
    this.executions++;

    return this.once(() => {
      this.executions--;
    });
  }

  acquireCall(): ReleaseActivity {
    this.assertNotConfiguring();

    if (this.calls >= this.maxCalls) {
      throw new ConnectionLimitError();
    }

    this.calls++;

    return this.once(() => {
      this.calls--;
    });
  }

  private assertNotConfiguring() {
    if (this.configuring) {
      throw new ProviderBusyError(
        'A configuração dos adaptadores está sendo atualizada.',
      );
    }
  }

  private once(release: ReleaseActivity): ReleaseActivity {
    let released = false;

    return () => {
      if (!released) {
        released = true;
        release();
      }
    };
  }
}
