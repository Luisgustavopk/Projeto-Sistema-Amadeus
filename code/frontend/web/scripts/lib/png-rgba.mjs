import { deflateSync, inflateSync } from 'node:zlib';

// Local authoring utility: lossless RGBA8 PNGs, non-interlaced only.
// No canvas premultiplication, resampling or colour conversion.
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
export function decodeRgbaPng(png) {
  if (!png.subarray(0, 8).equals(signature)) throw new Error('Not a PNG');
  const chunks = [], dataChunks = [];
  let offset = 8, ended = false;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    if (offset + length + 12 > png.length) throw new Error('Truncated PNG');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (crc32(png.subarray(offset + 4, offset + 8 + length)) !== png.readUInt32BE(offset + 8 + length)) throw new Error('PNG CRC mismatch: ' + type);
    chunks.push({ type, data });
    if (type === 'IDAT') dataChunks.push(data);
    offset += length + 12;
    if (type === 'IEND') { ended = true; break; }
  }
  const header = chunks[0];
  if (!ended || header?.type !== 'IHDR' || header.data.length !== 13) throw new Error('Invalid PNG structure');
  const width = header.data.readUInt32BE(0), height = header.data.readUInt32BE(4);
  if (!width || !height || width * height > 16_000_000 || !header.data.subarray(8).equals(Buffer.from([8, 6, 0, 0, 0]))) throw new Error('Expected non-interlaced RGBA8 PNG');
  const stride = width * 4, expected = (stride + 1) * height;
  const filtered = inflateSync(Buffer.concat(dataChunks), { maxOutputLength: expected });
  if (filtered.length !== expected) throw new Error('Invalid PNG pixel length');
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? rgba[i - 4] : 0;
      const up = y ? rgba[i - stride] : 0;
      const diagonal = y && x >= 4 ? rgba[i - stride - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter];
      rgba[i] = (filtered[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, rgba, chunks };
}
export function encodeRgbaPng(image) {
  const { width, height, rgba, chunks } = image;
  if (rgba.length !== width * height * 4) throw new Error('Invalid RGBA buffer');
  const stride = width * 4, filtered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const colourChunks = new Set(['cHRM', 'gAMA', 'iCCP', 'sRGB', 'cICP', 'pHYs']);
  return Buffer.concat([
    signature,
    chunk('IHDR', chunks[0].data),
    ...chunks.filter((c) => colourChunks.has(c.type)).map((c) => chunk(c.type, c.data)),
    chunk('IDAT', deflateSync(filtered, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
