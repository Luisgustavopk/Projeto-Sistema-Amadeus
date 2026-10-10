// Follow the connected opaque hair silhouette, excluding isolated alpha specks.
// Paint inward and clean the existing fringe; never grow into transparent pixels.
export function refineContinuousHairOutline(image, original, spec, change) {
  const { width, height } = image;
  const [left, top, right, bottom] = change.region;
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array((right - left) * (bottom - top));
  const [seedX, seedY] = change.seed;
  if (seedX < left || seedX >= right || seedY < top || seedY >= bottom || original[(seedY * width + seedX) * 4 + 3] < spec.alphaThreshold) throw new Error('Invalid hair seed');
  let start = 0, end = 1;
  queue[0] = seedY * width + seedX; mask[queue[0]] = 1;
  while (start < end) {
    const index = queue[start++], x = index % width, y = Math.floor(index / width);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy, n = ny * width + nx;
      if (nx < left || nx >= right || ny < top || ny >= bottom || mask[n] || original[n * 4 + 3] < spec.alphaThreshold) continue;
      mask[n] = 1; queue[end++] = n;
    }
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const radius = Math.ceil(change.widthPixels + 1);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = y * width + x, i = index * 4, alpha = original[i + 3];
      if (!alpha) continue;
      const inside = Boolean(mask[index]);
      let distance = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          const other = nx >= 0 && ny >= 0 && nx < width && ny < height && Boolean(mask[ny * width + nx]);
          if (other !== inside) distance = Math.min(distance, Math.hypot(dx, dy));
        }
      }
      const fade = clamp((bottom - 1 - y) / change.endFadePixels);
      if (!fade) continue;
      if (!inside && distance > 1.5) {
        // Remove the reddish low-opacity fringe outside the actual silhouette.
        // Preserve any opaque unrelated component rather than deleting artwork.
        if (alpha < spec.alphaThreshold) {
          image.rgba[i + 3] = Math.round(alpha * (1 - fade));
          if (!image.rgba[i + 3]) image.rgba.fill(0, i, i + 3);
        }
        continue;
      }
      const strength = (inside ? clamp(change.widthPixels + .5 - distance) : 1) * fade * (spec.strokeOpacity ?? 1);
      if (!strength) continue;
      for (let c = 0; c < 3; c++) image.rgba[i + c] = Math.round(original[i + c] + (Math.min(original[i + c], spec.colour[c]) - original[i + c]) * strength);
      if (inside && distance <= 1) {
        const target = Math.max(alpha, spec.edgeAlphaFloor ?? 224);
        image.rgba[i + 3] = Math.round(alpha + (target - alpha) * fade);
      } else if (!inside) {
        const target = spec.preserveNearEdgeAlpha ? alpha : Math.round(alpha * clamp((1.75 - distance) / .75));
        image.rgba[i + 3] = Math.round(alpha + (target - alpha) * fade);
      }
    }
  }
}
