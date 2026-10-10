import { createAvatarClock } from './avatar-clock.mjs';
import { createAvatarLayout } from './avatar-layout.mjs';
import { createAvatarGaze } from './avatar-gaze.mjs';
import { createAvatarExpressions } from './avatar-expressions.mjs';
import { applyAnimePalette } from './avatar-palette.mjs';

export function createAvatar({ canvas, host, onStatus }) {
  let app, model, loading, clock, layout, gaze, applyExpression, palette;
  let active = false;
  let disposed = false;
  const cancellation = new AbortController();
  let preferences = { tracking: true, zoom: 100 };
  let speakingUntil = 0;
  const isActive = () => active && !document.hidden;
  const updateActivity = () => clock?.setRunning(isActive());
  function release() {
    gaze?.destroy();
    layout?.destroy();
    clock?.destroy();
    palette?.destroy();
    model?.destroy();
    app?.destroy(false);
    model = app = clock = layout = gaze = applyExpression = palette = undefined;
  }
  async function load() {
    if (disposed) return false;
    if (model) return true;
    if (loading) return loading;
    loading = (async () => {
      onStatus({ state: 'loading' });
      try {
        const PIXI = window.PIXI;
        if (!PIXI?.live2d || !window.Live2DCubismCore)
          throw new Error('O runtime Live2D local não está disponível.');
        PIXI.live2d.config.sound = false;
        const path = new URL(
          '/live2d/amadeus/Kurisu.model3.json',
          location.href,
        ).href;
        const response = await fetch(path, {
          signal: AbortSignal.any([
            AbortSignal.timeout(15000),
            cancellation.signal,
          ]),
        });
        if (!response.ok)
          throw new Error('O modelo local da Kurisu não foi encontrado.');
        const settings = await response.json();
        if (disposed) return false;
        settings.url = path;
        for (const group of Object.values(
          settings.FileReferences.Motions ?? {},
        )) {
          for (const motion of group) {
            delete motion.Sound;
            delete motion.sound;
          }
        }
        const available = new Set(
          (settings.FileReferences.Expressions ?? []).map(
            (entry) => entry.Name,
          ),
        );
        app = new PIXI.Application({
          view: canvas,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(devicePixelRatio || 1, 2),
          autoDensity: true,
          autoStart: false,
          sharedTicker: false,
        });
        app.ticker.maxFPS = 30;
        model = await PIXI.live2d.Live2DModel.from(settings, {
          autoUpdate: false,
          autoInteract: false,
          motionPreload: 'IDLE',
        });
        if (disposed) {
          release();
          return false;
        }
        app.stage.addChild(model);
        palette = applyAnimePalette({ PIXI, app, model });
        model.anchor.set(0.5, 0.5);
        model.internalModel.on('beforeModelUpdate', () => {
          const now = performance.now();
          const mouth =
            now < speakingUntil
              ? Math.abs(Math.sin(now / 92) * Math.sin(now / 163)) * 0.65
              : 0;
          model.internalModel.coreModel.setParameterValueById(
            'ParamMouthOpenY',
            mouth,
          );
        });
        clock = createAvatarClock(app, model);
        layout = createAvatarLayout({ app, model, host });
        gaze = createAvatarGaze({ model, host, isActive });
        applyExpression = createAvatarExpressions({ model, available, clock });
        layout.configure(preferences);
        layout.fit();
        gaze.configure(preferences);
        updateActivity();
        clock.drawStill();
        onStatus({ state: 'ready' });
        return true;
      } catch (error) {
        release();
        if (disposed) return false;
        onStatus({ state: 'error', message: error.message });
        console.error('Avatar Live2D:', error);
        return false;
      }
    })();
    try {
      return await loading;
    } finally {
      loading = undefined;
    }
  }
  document.addEventListener('visibilitychange', updateActivity);
  return {
    load,
    expression: (name) =>
      applyExpression ? applyExpression(name) : Promise.resolve(false),
    get ready() {
      return Boolean(model);
    },
    setActive(value) {
      active = value;
      if (!active) gaze?.reset();
      if (active) layout?.fit();
      updateActivity();
    },
    configure(value) {
      preferences = { ...preferences, ...value };
      layout?.configure(preferences);
      gaze?.configure(preferences);
      clock?.drawStill();
    },
    speak(duration) {
      speakingUntil = performance.now() + duration;
    },
    stopSpeaking() {
      speakingUntil = 0;
    },
    destroy() {
      disposed = true;
      cancellation.abort();
      document.removeEventListener('visibilitychange', updateActivity);
      release();
    },
  };
}
