import { deflateSync } from 'node:zlib';

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const i16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const i32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const block = (b) => Buffer.concat([u32(b.length), b]);
function channels(rgba) {
  const data = Array.from({ length: 4 }, () => Buffer.alloc(rgba.length / 4));
  for (let i = 0; i < rgba.length / 4; i++)
    for (let c = 0; c < 4; c++) data[c][i] = rgba[i * 4 + c];
  return data;
}

// PSD's merged transparency preview uses RGB composited over white. Layer
// channels stay unassociated and lossless; only this 8-bit preview is matted.
function mergedPreviewChannels(rgba) {
  const data = channels(rgba);
  for (let i = 0; i < data[3].length; i++) {
    const alpha = data[3][i];
    for (let c = 0; c < 3; c++)
      data[c][i] = Math.round(data[c][i] * alpha / 255 + 255 - alpha);
  }
  return data;
}

// Inputs and PSD records are back-to-front. A folder has a bounding divider
// below its children and its folder record above them.
function folderRecords(layers) {
  return layers.flatMap(layer => {
    if (!Array.isArray(layer.layers)) return [layer];
    if (!layer.layers.length) throw new Error('Empty PSD folder: ' + layer.id);
    const marker = { left: 0, top: 0, width: 0, height: 0, blend: 'pass' };
    return [
      { ...marker, id: layer.id + '-end', sectionDivider: 3, visible: false },
      ...folderRecords(layer.layers),
      { ...marker, id: layer.id, sectionDivider: 1, visible: layer.visible },
    ];
  });
}

/** PSD v1, 8-bit RGBA, with named raster layers. This is not a Cubism project. */
export function writeLayeredPsd({ width, height, layers, merged, icc }) {
  if (width > 30000 || height > 30000 || merged.length !== width * height * 4)
    throw new RangeError('Invalid PSD dimensions');
  const records = [],
    pixels = [];
  const flattened = folderRecords(layers);
  if (!flattened.length || flattened.length > 32767)
    throw new RangeError('Invalid PSD layer count');
  for (const layer of flattened) {
    const raw = layer.sectionDivider ? Buffer.alloc(0) : Buffer.from(layer.rgba, 'base64');
    if (raw.length !== layer.width * layer.height * 4)
      throw new RangeError(layer.id);
    const streams = layer.sectionDivider ? [] : channels(raw).map((c) =>
      Buffer.concat([u16(2), deflateSync(c)]),
    );
    const ascii = Buffer.from(layer.id, 'ascii').subarray(0, 255);
    const pascal = Buffer.concat([Buffer.from([ascii.length]), ascii]);
    const padded = Buffer.concat([
      pascal,
      Buffer.alloc((4 - (pascal.length % 4)) % 4),
    ]);
    const unicode = Buffer.alloc(layer.id.length * 2);
    for (let i = 0; i < layer.id.length; i++)
      unicode.writeUInt16BE(layer.id.charCodeAt(i), i * 2);
    const extra = Buffer.concat([
      u32(0),
      u32(0),
      padded,
      Buffer.from('8BIMluni'),
      block(Buffer.concat([u32(layer.id.length), unicode])),
      ...(layer.sectionDivider ? [
        Buffer.from('8BIMlsct'),
        block(Buffer.concat([u32(layer.sectionDivider), Buffer.from('8BIMpass')])),
      ] : []),
    ]);
    records.push(
      Buffer.concat([
        i32(layer.top),
        i32(layer.left),
        i32(layer.top + layer.height),
        i32(layer.left + layer.width),
        u16(streams.length),
        ...streams.flatMap((s, c) => [i16(c === 3 ? -1 : c), u32(s.length)]),
        Buffer.from(
          '8BIM' +
            (layer.blend === 'pass'
              ? 'pass'
              : layer.blend === 'multiply'
              ? 'mul '
              : layer.blend === 'add'
                ? 'lddg'
                : 'norm'),
        ),
        Buffer.from([255, 0, layer.visible === false ? 2 : 0, 0]),
        block(extra),
      ]),
    );
    pixels.push(...streams);
  }
  const info = Buffer.concat([i16(-flattened.length), ...records, ...pixels]);
  const layerInfo =
    info.length % 2 ? Buffer.concat([info, Buffer.alloc(1)]) : info;
  const resources = Buffer.concat([
    // Explicit sRGB IEC61966-2.1, supplied by the OS; no color conversion.
    ...(icc
      ? [
          Buffer.from('8BIM'),
          u16(1039),
          Buffer.alloc(2),
          block(icc),
          ...(icc.length % 2 ? [Buffer.alloc(1)] : []),
        ]
      : []),
  ]);
  return Buffer.concat([
    Buffer.from('8BPS'),
    u16(1),
    Buffer.alloc(6),
    u16(4),
    u32(height),
    u32(width),
    u16(8),
    u16(3),
    u32(0),
    block(resources),
    block(Buffer.concat([block(layerInfo), u32(0)])),
    u16(2),
    deflateSync(Buffer.concat(mergedPreviewChannels(merged))),
  ]);
}
