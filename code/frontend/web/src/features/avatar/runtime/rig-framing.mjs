export function meshReference(raw, id) {
  const index = raw.drawables.ids.indexOf(id);
  if (index < 0) throw new Error('Referência de enquadramento ausente: ' + id);
  const vertices = raw.drawables.vertexPositions[index];
  let left = Infinity, right = -Infinity, top = -Infinity, bottom = Infinity;
  for (let i = 0; i < vertices.length; i += 2) {
    left = Math.min(left, vertices[i]); right = Math.max(right, vertices[i]);
    bottom = Math.min(bottom, vertices[i+1]); top = Math.max(top, vertices[i+1]);
  }
  if (![left,right,top,bottom].every(Number.isFinite) || right <= left)
    throw new Error('Referência geométrica inválida.');
  return { width: right-left, x: (left+right)/2, y: (top+bottom)/2 };
}

/** Align by the same facial landmark in model units, never by total artwork
 * bounds (which change when an arm is extended). One uniform scale preserves
 * proportions and the authored forward lean stays free to move the landmark. */
export function calibratedProjection({ native, extra, nativeHeight, width, height, framing, top, zoom, presentation = {} }) {
  const ratio = native.width / extra.width;
  const target = framing * zoom / 100;
  const units = target * (presentation.scale ?? 1) / nativeHeight;
  return {
    xScale: 2 * units * ratio * height / width,
    yScale: 2 * units * ratio,
    x: 2 * height / width * ((presentation.x ?? 0) + units * (native.x-ratio*extra.x)),
    y: 1 - 2 * (top + target/2 + (presentation.y ?? 0)) + 2 * units * (native.y-ratio*extra.y),
  };
}
