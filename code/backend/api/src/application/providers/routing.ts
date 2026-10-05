import type { ProviderConfig, Role } from '../../domain/providers/model.ts';
import type { ProviderInput } from '../../ports/provider.ts';
import { isCasualConversation } from '../../domain/providers/conversation-routing.ts';
import { providerAttempts } from './fallback.ts';

function currentUtterance(content: string): string {
  const boundary = '\nNova fala:\n';
  const index = content.indexOf(boundary);

  if (index < 0) {
    return content;
  }

  try {
    const value: unknown = JSON.parse(content.slice(index + boundary.length));

    if (
      value &&
      typeof value === 'object' &&
      'user' in value &&
      typeof value.user === 'string'
    ) {
      return value.user;
    }
  } catch {
    // Unknown wire content is never classified as casual.
  }

  return '';
}

export function configuredProviderAttempts(
  role: Role,
  config: ProviderConfig,
): ProviderConfig[] {
  const attempts = providerAttempts(role, config);

  return role === 'llm' && config.localProvider
    ? [...attempts, { ...config.localProvider, limits: config.limits }]
    : attempts;
}

export function selectProviderAttempts(
  role: Role,
  config: ProviderConfig,
  input: ProviderInput,
): ProviderConfig[] {
  const cloud = providerAttempts(role, config);

  if (role !== 'llm' || !config.localProvider) {
    return cloud;
  }

  const local: ProviderConfig = {
    ...config.localProvider,
    limits: config.limits,
  };

  if (input.dataClass === 'local-only') {
    return [local];
  }

  if (config.localRouting === 'cloud-first') {
    return [...cloud, local];
  }

  return isCasualConversation(currentUtterance(input.content))
    ? [local, ...cloud]
    : cloud;
}
