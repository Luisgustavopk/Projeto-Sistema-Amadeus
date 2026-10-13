// Isolated realm: the SDK 5.3 Core does not replace the primary Pixi Core.
// Simulation is driven by the parent's existing clock, never by another ticker.
import { CubismFramework } from '@cubism-sdk/live2dcubismframework';
import { CubismMoc } from '@cubism-sdk/model/cubismmoc';
import { CubismMatrix44 } from '@cubism-sdk/math/cubismmatrix44';
import { CubismRenderer_WebGL } from '@cubism-sdk/rendering/cubismrenderer_webgl';
import { CubismShaderManager_WebGL } from '@cubism-sdk/rendering/cubismshader_webgl';
import { CubismRenderTarget_WebGL } from '@cubism-sdk/rendering/cubismrendertarget_webgl';

// R5 calls destroyRenderTarget during first allocation, before assigning _gl.
// Seed the context only on first allocation; later cleanup remains unchanged.
const allocateTarget = CubismRenderTarget_WebGL.prototype.createRenderTarget;
CubismRenderTarget_WebGL.prototype.createRenderTarget = function(context, ...args) {
  this._gl ??= context;
  return allocateTarget.call(this, context, ...args);
};

const canvas = document.getElementById('stage');
let moc, model, renderer, gl, destroyed = false;
const textures = [];
const signal = new AbortController();
async function fetchAsset(url, type = 'arrayBuffer') {
  const response = await fetch(url, { signal: signal.signal });
  if (!response.ok) throw new Error('Arquivo do rig extra ausente: ' + url);
  return response[type]();
}
async function load() {
  CubismFramework.startUp(); CubismFramework.initialize();
  canvas.width = Math.max(1, innerWidth); canvas.height = Math.max(1, innerHeight);
  gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) throw new Error('WebGL indisponível para o rig extra.');
  const url = '/live2d/extra-rig/v16/Amadeus-rig-v16.model3.json';
  const settings = await fetchAsset(url, 'json');
  const base = new URL(url, location.href);
  moc = CubismMoc.create(await fetchAsset(new URL(settings.FileReferences.Moc, base)), true);
  if (!moc) throw new Error('MOC3 do rig extra incompatível ou inválido.');
  model = moc.createModel();
  renderer = new CubismRenderer_WebGL();
  renderer.initialize(model);
  renderer.gl = gl;
  renderer.setRenderState(null, [0, 0, canvas.width, canvas.height]);
  renderer.startUp(gl);
  renderer.setIsPremultipliedAlpha(true);
  await Promise.all(settings.FileReferences.Textures.map(async (file, index) => {
    const bitmap = await createImageBitmap(await fetchAsset(new URL(file, base), 'blob'), { premultiplyAlpha: 'premultiply' });
    try {
      const texture = gl.createTexture(); textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // ImageBitmap applies premultiplication at decode time; WebGL unpack
      // conversion flags do not affect ImageBitmap uploads.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      renderer.bindTexture(index, texture);
    } finally { bitmap.close(); }
  }));
  draw({ parameters: {}, zoom: 100, framing: 1, top: 0 });
  const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);
  const deadline = performance.now() + 15000;
  while (!shader._isShaderLoaded) {
    if (destroyed || performance.now() > deadline) throw new Error('Falha ao preparar shaders do rig extra.');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return inspect();
}
function draw({ parameters = {}, zoom = 100, framing = 1.4, top = .12, presentation = {} }) {
  if (!model || destroyed) return;
  const raw = model.getModel(), p = raw.parameters;
  p.values.set(p.defaultValues);
  for (const [id, value] of Object.entries(parameters)) {
    const i = p.ids.indexOf(id);
    if (i >= 0 && Number.isFinite(value)) p.values[i] = Math.max(p.minimumValues[i], Math.min(p.maximumValues[i], value));
  }
  model.update();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(innerWidth * ratio)), h = Math.max(1, Math.round(innerHeight * ratio));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const canvasHeight = raw.canvasinfo.CanvasHeight / raw.canvasinfo.PixelsPerUnit;
  const targetHeight = framing * zoom / 100 * (presentation.scale ?? 1);
  const scaleY = 2 * targetHeight / canvasHeight;
  const matrix = new CubismMatrix44();
  const values = matrix.getArray();
  values[0] = scaleY * h / w; values[5] = scaleY;
  values[12] = (presentation.x ?? 0) * 2 * h / w;
  values[13] = 1 - 2 * top - targetHeight - (presentation.y ?? 0) * 2;
  renderer.setMvpMatrix(matrix);
  renderer.setRenderState(null, [0, 0, w, h]);
  renderer.drawModel('/live2d/extra-runtime/shaders/');
}
function inspect() {
  if (!model) return null;
  const raw = model.getModel(), p = raw.parameters;
  const background = new Uint8Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, background);
  return {
    parameters: p.ids.map((id, i) => ({ id, min: p.minimumValues[i], max: p.maximumValues[i], default: p.defaultValues[i], value: p.values[i] })),
    drawables: raw.drawables.ids,
    vertices: Array.from(raw.drawables.vertexPositions, v => Array.from(v)),
    opacities: Array.from(raw.drawables.opacities),
    parts: { ids: raw.parts.ids, opacities: Array.from(raw.parts.opacities) },
    offscreens: { count: raw.offscreens.count, opacities: Array.from(raw.offscreens.opacities) },
    backgroundPixel: Array.from(background),
  };
}
function destroy() {
  if (destroyed) return; destroyed = true; signal.abort();
  renderer?.release(); for (const texture of textures) gl?.deleteTexture(texture);
  if (model) moc.deleteModel(model); moc?.release(); CubismFramework.dispose();
}
window.extraRig = { draw, inspect, destroy };
window.extraRigReady = load().catch(error => { destroy(); throw error; });
