import {
  DataPolicyBlockedError,
  ProviderDisabledError,
} from '../errors/providers.ts';
import type { ProviderConfig, DataClass } from './model.ts';

export function assertProviderCanExecute(
  config: ProviderConfig,
  dataClass: DataClass,
) {
  if (config.adapter === 'disabled') {
    throw new ProviderDisabledError();
  }

  if (
    dataClass === 'local-only' ||
    (dataClass === 'personal' && config.dataPolicy !== 'personal-approved')
  ) {
    throw new DataPolicyBlockedError();
  }
}
