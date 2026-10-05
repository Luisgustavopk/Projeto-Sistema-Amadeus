import { readFileSync } from 'node:fs';
import { z } from 'zod';

const PresetsSchema = z.strictObject({
  enabled: z.boolean(),
  phrases: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});

const presets = PresetsSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('./provider-wait-presets.json', import.meta.url),
      'utf8',
    ),
  ),
);

export function providerWaitPhrase() {
  return presets.enabled ? presets.phrases[0]! : null;
}
