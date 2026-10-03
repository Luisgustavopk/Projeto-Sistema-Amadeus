import type { ProviderServices } from '../providers/index.ts';
import type { VoiceProfiles } from './profiles.ts';

export function createVoiceCapabilities(
  providers: Pick<ProviderServices, 'describe'>,
  profiles: Pick<VoiceProfiles, 'active'>,
) {
  return {
    async inspect() {
      const [adapters, profile] = await Promise.all([
        providers.describe(),
        profiles.active(),
      ]);
      const available = adapters.every((adapter) => adapter.available);
      const customVoice =
        Boolean(profile) &&
        adapters.some(
          (adapter) =>
            adapter.role === 'tts' &&
            adapter.available &&
            adapter.capabilities.customVoice,
        );

      return {
        voice: available && customVoice,
        customVoice,
        profile,
        providers: adapters,
      };
    },
  };
}
