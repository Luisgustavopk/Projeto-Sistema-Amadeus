/** Renderer-only palette inspired by the user's anime reference.
 * It preserves the atlas, alpha, linework and the Live2D rig.
 * Set enabled to false to return to the source model's colors.
 */
export const ANIME_PALETTE = Object.freeze({
  enabled: true,
  strength: 1,
  hair: Object.freeze({ hue: 0.99, saturation: 0.62, valueScale: 0.66 }),
  eyes: Object.freeze({ hue: 0.65, saturation: 0.36, valueScale: 0.94 }),
  tie: Object.freeze({ hue: 0.995, saturation: 0.85, valueScale: 0.68 }),
  skin: Object.freeze({ hue: 0.065, saturation: 0.065, valueScale: 0.98 }),
  coat: Object.freeze({ hue: 0.57, saturation: 0.14, valueScale: 0.99 }),
});

const FRAGMENT = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float strength;
uniform vec3 hair;
uniform vec3 eyes;
uniform vec3 tie;
uniform vec3 skin;
uniform vec3 coat;

vec3 rgbToHsv(vec3 color) {
  float high = max(color.r, max(color.g, color.b));
  float low = min(color.r, min(color.g, color.b));
  float delta = high - low;
  float hue = 0.0;
  if (delta > 0.00001) {
    if (high == color.r) hue = (color.g - color.b) / delta;
    else if (high == color.g) hue = 2.0 + (color.b - color.r) / delta;
    else hue = 4.0 + (color.r - color.g) / delta;
  }
  return vec3(fract(hue / 6.0), delta / max(high, 0.00001), high);
}

vec3 hsvToRgb(vec3 hsv) {
  vec3 ramps = clamp(abs(mod(hsv.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return hsv.z * mix(vec3(1.0), ramps, hsv.y);
}

float hueBand(float hue, float center, float inner, float outer) {
  float distance = abs(hue - center);
  distance = min(distance, 1.0 - distance);
  return 1.0 - smoothstep(inner, outer, distance);
}

void main() {
  vec4 pixel = texture2D(uSampler, vTextureCoord);
  if (pixel.a < 0.00001) {
    gl_FragColor = pixel;
    return;
  }
  // Pixi filter inputs are premultiplied. Work in straight RGB and restore alpha.
  vec3 original = clamp(pixel.rgb / pixel.a, 0.0, 1.0);
  vec3 hsv = rgbToHsv(original);
  vec3 color = original;

  // Saturated copper belongs to the hair; pale face colors are excluded.
  float hairMask = hueBand(hsv.x, 0.062, 0.038, 0.085)
    * smoothstep(0.43, 0.65, hsv.y) * smoothstep(0.12, 0.24, hsv.z);
  // Brown-red shadows and red highlights retain the source texture's depth.
  float hairHue = fract(hair.x + 0.03 * (1.0 - hsv.z));
  vec3 hairColor = hsvToRgb(vec3(hairHue, mix(hsv.y, hair.y, 0.85), pow(hsv.z, 1.12) * hair.z));
  color = mix(color, hairColor, hairMask);

  // Deep reds become burgundy; the less-saturated cheek blush is excluded.
  float tieMask = hueBand(hsv.x, 0.0, 0.012, 0.038)
    * smoothstep(0.42, 0.62, hsv.y) * smoothstep(0.15, 0.30, hsv.z);
  color = mix(color, hsvToRgb(vec3(tie.x, tie.y, hsv.z * tie.z)), tieMask);

  // Blue-violet irises; neutral whites and ink stay untouched.
  float eyeMask = hueBand(hsv.x, 0.755, 0.09, 0.16)
    * smoothstep(0.035, 0.14, hsv.y) * smoothstep(0.17, 0.3, hsv.z);
  color = mix(color, hsvToRgb(vec3(eyes.x, eyes.y, hsv.z * eyes.z)), eyeMask);

  // Rosy cheeks shift toward red: keep them instead of whitening the blush.
  float skinMask = hueBand(hsv.x, 0.11, 0.025, 0.07)
    * smoothstep(0.06, 0.105, hsv.x)
    * (1.0 - smoothstep(0.31, 0.48, hsv.y)) * smoothstep(0.55, 0.80, hsv.z);
  // Scale value instead of lifting it: pale ivory still keeps facial shadows.
  vec3 skinColor = hsvToRgb(vec3(skin.x, skin.y, hsv.z * skin.z));
  color = mix(color, skinColor, skinMask);

  float coatMask = hueBand(hsv.x, 0.42, 0.12, 0.22)
    * (1.0 - smoothstep(0.24, 0.40, hsv.y)) * smoothstep(0.33, 0.55, hsv.z);
  vec3 coatColor = hsvToRgb(vec3(coat.x, min(coat.y, max(hsv.y, 0.045)), min(1.0, hsv.z * coat.z)));
  color = mix(color, coatColor, coatMask);

  gl_FragColor = vec4(mix(original, clamp(color, 0.0, 1.0), strength) * pixel.a, pixel.a);
}
`;

export function applyAnimePalette({ PIXI, app, model }) {
  if (!ANIME_PALETTE.enabled) return { destroy() {} };
  const previous = model.filters;
  const filter = new PIXI.Filter(undefined, FRAGMENT, {
    strength: Math.min(1, Math.max(0, ANIME_PALETTE.strength)),
    hair: [
      ANIME_PALETTE.hair.hue,
      ANIME_PALETTE.hair.saturation,
      ANIME_PALETTE.hair.valueScale,
    ],
    eyes: [
      ANIME_PALETTE.eyes.hue,
      ANIME_PALETTE.eyes.saturation,
      ANIME_PALETTE.eyes.valueScale,
    ],
    tie: [
      ANIME_PALETTE.tie.hue,
      ANIME_PALETTE.tie.saturation,
      ANIME_PALETTE.tie.valueScale,
    ],
    skin: [
      ANIME_PALETTE.skin.hue,
      ANIME_PALETTE.skin.saturation,
      ANIME_PALETTE.skin.valueScale,
    ],
    coat: [
      ANIME_PALETTE.coat.hue,
      ANIME_PALETTE.coat.saturation,
      ANIME_PALETTE.coat.valueScale,
    ],
  });
  filter.padding = 0;
  filter.resolution = app.renderer.resolution;
  const previousArea = model.filterArea;
  model.filterArea = app.screen;
  model.filters = [...(previous ?? []), filter];
  return {
    destroy() {
      model.filters = previous;
      model.filterArea = previousArea;
      filter.destroy();
    },
  };
}
