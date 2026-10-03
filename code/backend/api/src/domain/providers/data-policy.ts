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
    (dataClass === 'local-only' && config.dataPolicy !== 'local-approved') ||
    (dataClass === 'personal' &&
      config.dataPolicy !== 'personal-approved' &&
      config.dataPolicy !== 'local-approved')
  ) {
    throw new DataPolicyBlockedError();
  }
}
