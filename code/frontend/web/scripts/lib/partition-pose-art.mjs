import { encodeRgbaPng } from './png-rgba.mjs';

// A lossless partition, not segmentation by repainting or generated imagery.
// Later selections own pixels over earlier selections; all unselected art is
// retained in the base layer. These cutouts do not supply hidden joint artwork.
export function partitionPoseArt(image, selections) {
  const { width, height, rgba } = image;
  if (!selections[0]?.fallback || selections.slice(1).some(s => s.fallback))
    throw new Error('Exactly one base layer is required');
  const owners = new Uint16Array(width * height);
  const ids = new Set();
  const matchesColour = (n, type) => {
    const [r,g,b,a] = rgba.subarray(n * 4, n * 4 + 4);
    if (!a) return false;
    if (type === 'hair') return r > 28 && r > g * 1.45 && r > b * 1.35;
    if (type === 'skin') return r > 70 && g > 60 && b > 40 && r > g + 3 && g > b + 4;
    if (type === 'tie') return r > 55 && r > g * 1.8 && r > b * 1.8;
    throw new Error('Unknown colour selection: ' + type);
  };
  for (const [index, layer] of selections.entries()) {
    if (!/^[a-z][a-z-]*$/.test(layer.id) || ids.has(layer.id)) throw new Error('Invalid or duplicate layer ID');
    ids.add(layer.id);
    if (layer.fallback) continue;
    const points = layer.polygon;
    if (points?.length < 3 || !points?.every(p => p.length === 2 && p.every(Number.isFinite)))
      throw new Error('Invalid polygon: ' + layer.id);
    const first = Math.max(0, Math.ceil(Math.min(...points.map(p => p[1])) - .5));
    const last = Math.min(height, Math.ceil(Math.max(...points.map(p => p[1])) - .5));
    for (let y = first; y < last; y++) {
      const intersections = [], py = y + .5;
      for (let n = 0; n < points.length; n++) {
        const a = points[n], b = points[(n + 1) % points.length];
        if ((a[1] > py) === (b[1] > py)) continue;
        intersections.push(a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let n = 0; n + 1 < intersections.length; n += 2) {
        const left = Math.max(0, Math.ceil(intersections[n] - .5));
        const right = Math.min(width, Math.ceil(intersections[n + 1] - .5));
        for (let x = left; x < right; x++) {
          const n = y * width + x;
          if (!rgba[n * 4 + 3]) continue;
          const colourSelection = layer.colourSelection ?? (y > layer.hairOnlyBelowY ? 'hair' : null);
          if (colourSelection && !matchesColour(n, colourSelection)) {
            // Include a one-pixel outline around the selected colour, without
            // carrying white clothing into a hand, hair strand or neck cutout.
            let near = false;
            if (Math.max(rgba[n*4],rgba[n*4+1],rgba[n*4+2]) < 110) {
              for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
                if(x+dx>=0 && x+dx<width && y+dy>=0 && y+dy<height && matchesColour((y+dy)*width+x+dx,colourSelection)) near=true;
              }
            }
            if (!near) continue;
          }
          owners[n] = index;
        }
      }
    }
  }
  const bounds = selections.map(() => [width, height, -1, -1]);
  const counts = selections.map(() => 0);
  for (let n = 0; n < owners.length; n++) {
    const i = n * 4;
    if (!rgba[i] && !rgba[i + 1] && !rgba[i + 2] && !rgba[i + 3]) continue;
    const x = n % width, y = Math.floor(n / width), owner = owners[n], b = bounds[owner];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    if (rgba[i + 3]) counts[owner]++;
  }
  const composite = Buffer.alloc(rgba.length);
  const layers = selections.map((selection, index) => {
    const [left, top, right, bottom] = bounds[index];
    if (!counts[index]) throw new Error('Selection has no visible pixels: ' + selection.id);
    const lw = right - left + 1, lh = bottom - top + 1, pixels = Buffer.alloc(lw * lh * 4);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const n = y * width + x;
      if (owners[n] !== index) continue;
      const source = n * 4, destination = ((y - top) * lw + x - left) * 4;
      rgba.copy(pixels, destination, source, source + 4);
      pixels.copy(composite, source, destination, destination + 4);
    }
    const chunks = image.chunks.map(chunk => {
      if (chunk.type !== 'IHDR') return chunk;
      const data = Buffer.from(chunk.data); data.writeUInt32BE(lw, 0); data.writeUInt32BE(lh, 4);
      return { ...chunk, data };
    });
    return {
      ...selection, left, top, width: lw, height: lh, visiblePixels: counts[index],
      blend: 'normal', rgba: pixels.toString('base64'),
      png: encodeRgbaPng({ width: lw, height: lh, rgba: pixels, chunks }),
    };
  });
  if (!composite.equals(rgba)) throw new Error('Layer partition changed approved pixels');
  return { layers, composite };
}
