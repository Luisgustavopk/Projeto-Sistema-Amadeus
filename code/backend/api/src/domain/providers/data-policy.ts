import {
  DataPolicyBlockedError,
  ProviderDisabledError,
} from '../errors/providers.ts';
import type { ProviderConfig, DataClass } from './model.ts';

export function providerCanProcessDataClass(
  config: ProviderConfig,
  dataClass: DataClass,
) {
  return (
    config.adapter !== 'disabled' &&
    (dataClass !== 'local-only' || config.dataPolicy === 'local-approved') &&
    (dataClass !== 'personal' ||
      (config.dataPolicy === 'personal-approved' &&
        (config.adapter !== 'gemini' || config.geminiTier === 'paid')) ||
      config.dataPolicy === 'local-approved')
  );
}

export function assertProviderCanExecute(
  config: ProviderConfig,
  dataClass: DataClass,
) {
  if (config.adapter === 'disabled') {
    throw new ProviderDisabledError();
  }

  if (!providerCanProcessDataClass(config, dataClass)) {
    throw new DataPolicyBlockedError();
  }
}
