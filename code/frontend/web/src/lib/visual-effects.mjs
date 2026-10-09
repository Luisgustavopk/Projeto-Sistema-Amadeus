// Procedural background layers inspired by the supplied composite videos.
// No recorded character, login form, desktop capture or audio is embedded.
// Main-screen grain is off by default. Use 0.003–0.008 for a subtle texture.
export const STAGE_NOISE_OPACITY = 0.002;
const CODE = [
  'def set_state(self, other, room):',
  '    if not isinstance(other, Room):',
  '        return self._gate_signal',
  '    self._set_w(None)',
  '    return other._get_state()',
  '',
  'const frame = buffer.read(offset);',
  'for (let index = 0; index < length; index++) {',
  '    signal[index] ^= key[index % 8];',
  '    state = sample(signal, time);',
  '}',
  '',
  'static int init_module(void)',
  '    alloc_pages(GFP_KERNEL, order);',
  '    if (!(flags & MAP_FIXED)) return;',
  '    reset_page_mapping(buffer);',
  '    return 0;',
  '',
  'const data = stream.nextFrame();',
  '    dst_idx = src_idx + offset;',
  '    dst[dst_idx++] = charset[(s0 >> 18) & 63];',
  '    s0 = data[src_idx];',
  '    s1 = data[src_idx + 1];',
  '    s2 = data[src_idx + 2];',
];
const BOOT = [
  'Amadeus System ver.1.09.3',
  '',
  '> Initializing interface ... OK',
  '> Detecting render device ... OK',
  '> Loading kernel ... OK',
  '> Detecting visual control ... OK',
  '> BOOTING',
  '> Processor 0 is Active ... OK',
  '> Processor 1 is Active ... OK',
  '> Processor 2 is Active ... OK',
  '> Memory initialized: 32767 KBytes',
  '',
  'INIT: Kernel version 2.04',
];
const TRAINING = [
  'TRAINING DATA',
  '----------------------------------------',
  'INPUTS: 0.0, 0.0; Expected output: 0.0',
  'INPUTS: 0.0, 1.0; Expected output: 1.0',
  'INPUTS: 1.0, 0.0; Expected output: 1.0',
  'INPUTS: 1.0, 1.0; Expected output: 1.0',
  '----------------------------------------',
  'Begin Training',
  'Feed Forward INPUT:0.0, OUTPUT:0.394859',
  'Feed Forward INPUT:1.0, OUTPUT:0.449029',
  'Feed Forward INPUT:0.0, OUTPUT:0.362033',
  'Feed Forward INPUT:1.0, OUTPUT:0.711844',
  '----------------------------------------',
  'Iteration 04 / signal convergence',
];

export function createVisualEffects({
  canvas,
  screen: initialScreen = 'welcome',
}) {
  const layers = {
    welcome: { canvas, context: canvas.getContext('2d') },
    home: { canvas, context: canvas.getContext('2d') },
  };
  let screen = initialScreen;
  let preferences = { effects: true };
  let frame;
  let lastFrame = 0;
  let clock = 0;
  let lastNoise = -1;
  let destroyed = false;
  const noise = document.createElement('canvas');
  noise.width = 160;
  noise.height = 90;
  const noiseContext = noise.getContext('2d');
  const noiseData = noiseContext.createImageData(noise.width, noise.height);
  const random = (() => {
    let seed = 197403;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  const particles = Array.from({ length: 72 }, () => ({
    x: random(),
    y: random(),
    speed: 0.009 + random() * 0.027,
    phase: random() * Math.PI * 2,
    size: 1 + random() * 2,
    type: Math.floor(random() * 4),
    alpha: 0.2 + random() * 0.65,
  }));

  function refreshNoise() {
    const interval = Math.floor(clock * 10);
    if (interval === lastNoise) return;
    lastNoise = interval;
    for (let i = 0; i < noiseData.data.length; i += 4) {
      const value = Math.floor(random() * 255);
      noiseData.data[i] = value;
      noiseData.data[i + 1] = value;
      noiseData.data[i + 2] = value;
      noiseData.data[i + 3] = 255;
    }
    noiseContext.putImageData(noiseData, 0, 0);
  }

  function terminal(
    context,
    x,
    y,
    width,
    height,
    lines,
    speed,
    fontSize,
    opacity,
  ) {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.font = `${fontSize}px Consolas, monospace`;
    context.fillStyle = `rgba(215,58,42,${opacity})`;
    const lineHeight = fontSize * 1.5;
    const offset = clock * speed;
    const start = Math.floor(offset / lineHeight);
    for (let i = -1; i <= height / lineHeight + 1; i++) {
      const index =
        (((start + i) % lines.length) + lines.length) % lines.length;
      context.fillText(
        lines[index],
        x + 3,
        y + (i + 1) * lineHeight - (offset % lineHeight),
      );
    }
    context.restore();
  }

  function drawWelcome(context, width, height) {
    context.fillStyle = '#020303';
    context.fillRect(0, 0, width, height);
    const unit = Math.min(width / 1280, height / 720);
    const small = Math.max(8, 10 * unit);
    // Independent code panes and boot/training terminals, like the reference.
    terminal(
      context,
      0,
      0,
      width * 0.3,
      height * 0.24,
      Array.from(
        { length: 24 },
        (_, i) =>
          `LiveContext ${String(i + 1).padStart(2, '0')}:20   2.${(197 + i * 31).toString()}  ${'A3F28B1C'.repeat(4)}`,
      ),
      12,
      small,
      0.47,
    );
    terminal(
      context,
      width * 0.33,
      0,
      width * 0.3,
      height * 0.32,
      CODE,
      7,
      small,
      0.43,
    );
    terminal(
      context,
      width * 0.012,
      height * 0.3,
      width * 0.27,
      height * 0.22,
      CODE,
      17,
      small * 0.82,
      0.43,
    );
    terminal(
      context,
      width * 0.014,
      height * 0.54,
      width * 0.31,
      height * 0.45,
      CODE.slice(18).concat(CODE),
      4,
      small * 1.15,
      0.56,
    );
    terminal(
      context,
      width * 0.65,
      height * 0.48,
      width * 0.34,
      height * 0.39,
      TRAINING,
      2.5,
      small * 1.1,
      0.59,
    );
    terminal(
      context,
      width * 0.36,
      height * 0.82,
      width * 0.15,
      height * 0.16,
      TRAINING,
      9,
      small * 0.64,
      0.4,
    );

    context.save();
    context.font = `${small * 1.15}px Consolas, monospace`;
    context.fillStyle = '#be4538';
    const typed = clock % 17;
    BOOT.forEach((line, i) => {
      const count = Math.max(
        0,
        Math.min(line.length, Math.floor((typed - i * 0.55) * 40)),
      );
      context.fillText(
        line.slice(0, count),
        width * 0.66,
        height * 0.03 + i * small * 1.4,
      );
    });
    context.strokeStyle = '#9c322338';
    context.lineWidth = 1;
    for (const x of [0.32, 0.64]) {
      context.beginPath();
      context.moveTo(width * x, 0);
      context.lineTo(width * x, height);
      context.stroke();
    }
    context.restore();

    const glow = context.createRadialGradient(
      width * 0.52,
      height * 0.56,
      10,
      width * 0.52,
      height * 0.56,
      width * 0.52,
    );
    glow.addColorStop(0, '#92314418');
    glow.addColorStop(0.5, '#27172312');
    glow.addColorStop(1, '#02030300');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    // The sweeping reflection is behind the UI, never a white flash over text.
    const sweep = (((clock * 0.055) % 1.8) - 0.4) * width;
    context.save();
    context.globalAlpha = 0.08;
    context.fillStyle = '#8e9895';
    context.beginPath();
    context.moveTo(sweep, 0);
    context.lineTo(sweep + width * 0.18, 0);
    context.lineTo(sweep - width * 0.35, height);
    context.lineTo(sweep - width * 0.45, height);
    context.fill();
    context.restore();
    if (preferences.effects) {
      context.save();
      context.globalAlpha = 0.022;
      context.drawImage(noise, 0, 0, width, height);
      context.restore();
      if (clock % 6 > 5.86) {
        context.fillStyle = '#bc453933';
        context.fillRect(width * 0.04, height * 0.27, width * 0.26, 2);
        context.fillRect(width * 0.65, height * 0.64, width * 0.22, 1);
      }
    }
  }

  function drawStage(context, width, height) {
    const background = context.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#1a2034');
    background.addColorStop(0.32, '#0a111f');
    background.addColorStop(1, '#02050c');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    const halo = context.createRadialGradient(
      width * 0.5,
      height * 0.12,
      0,
      width * 0.5,
      height * 0.12,
      width * 0.56,
    );
    halo.addColorStop(0, '#56739522');
    halo.addColorStop(0.6, '#2948670b');
    halo.addColorStop(1, '#01071000');
    context.fillStyle = halo;
    context.fillRect(0, 0, width, height);
    for (const particle of particles) {
      const x =
        particle.x * width + Math.sin(clock * 0.22 + particle.phase) * 8;
      const y =
        (((particle.y + clock * particle.speed) % 1.12) - 0.06) * height;
      const alpha =
        particle.alpha *
        (0.55 + 0.45 * Math.sin(clock * 0.65 + particle.phase) ** 2);
      const size = particle.size * Math.max(0.8, Math.min(1.3, width / 1280));
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = '#55d6f2';
      context.shadowBlur = 7;
      context.shadowColor = '#32c9fc';
      context.fillRect(x, y, size, size * (particle.type === 0 ? 4 : 1));
      if (particle.type === 1) {
        context.fillRect(x + size, y + size * 2, size * 2, size);
        context.fillRect(x + size * 2, y - size * 2, size, size * 3);
      }
      if (particle.type === 2)
        context.fillRect(x - size * 2, y, size * 5, size * 0.6);
      context.restore();
      if (particle.type === 0) {
        context.fillStyle = '#62b5d512';
        context.fillRect(x, y - size * 28, 0.7, size * 20);
      }
    }
    if (preferences.effects) {
      context.save();
      context.globalAlpha = STAGE_NOISE_OPACITY;
      context.drawImage(noise, 0, 0, width, height);
      context.restore();
      if (clock % 5.9 > 5.8) {
        context.fillStyle = '#68c9ee16';
        context.fillRect(width * 0.06, height * 0.36, width * 0.19, 2);
        context.fillStyle = '#10172380';
        context.fillRect(width * 0.72, height * 0.61, width * 0.22, 4);
      }
    }
  }

  function draw() {
    const { context, width, height } = layers[screen];
    if (!context || !width || !height) return;
    refreshNoise();
    if (screen === 'welcome') drawWelcome(context, width, height);
    else drawStage(context, width, height);
  }
  function tick(timestamp) {
    frame = undefined;
    if (destroyed || document.hidden) return;
    if (!lastFrame || timestamp - lastFrame >= 1000 / 24) {
      clock += Math.min(0.12, lastFrame ? (timestamp - lastFrame) / 1000 : 0);
      lastFrame = timestamp;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function updateActivity() {
    cancelAnimationFrame(frame);
    frame = undefined;
    lastFrame = 0;
    if (destroyed || document.hidden) return;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    for (const layer of Object.values(layers)) {
      layer.width = layer.canvas.clientWidth || innerWidth;
      layer.height = layer.canvas.clientHeight || innerHeight;
      layer.canvas.width = Math.round(layer.width * ratio);
      layer.canvas.height = Math.round(layer.height * ratio);
      layer.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    draw();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', updateActivity);
  resize();
  updateActivity();
  return {
    setScreen(value) {
      if (!(value in layers)) return;
      screen = value;
      resize();
      updateActivity();
    },
    configure(value) {
      preferences = { ...preferences, ...value };
      updateActivity();
    },
    suspend() {
      cancelAnimationFrame(frame);
      frame = undefined;
    },
    resume: updateActivity,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', updateActivity);
    },
  };
}
