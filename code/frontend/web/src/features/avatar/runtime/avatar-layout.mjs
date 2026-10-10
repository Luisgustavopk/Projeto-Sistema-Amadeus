export function createAvatarLayout({ app, model, host }) {
  let zoom = 100;
  let width = 0;
  let height = 0;
  let baseScale = 1,
    baseX = 0,
    baseY = 0;
  let presentation = { scale: 1, x: 0, y: 0 };
  function applyPresentation() {
    model.scale.set(baseScale * presentation.scale);
    model.position.set(
      baseX + height * presentation.x,
      baseY + height * presentation.y,
    );
  }
  function fit() {
    if (!host.clientHeight) return;
    if (width !== host.clientWidth || height !== host.clientHeight) {
      width = host.clientWidth;
      height = host.clientHeight;
      app.renderer.resize(width, height);
    }
    const style = getComputedStyle(host);
    const framing =
      Number.parseFloat(style.getPropertyValue('--avatar-framing')) || 1.4;
    const top =
      Number.parseFloat(style.getPropertyValue('--avatar-top')) || 0.12;
    const targetHeight = (height * framing * zoom) / 100;
    baseScale = targetHeight / model.internalModel.height;
    baseX = width / 2;
    baseY = height * top + targetHeight / 2;
    applyPresentation();
  }
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  return {
    fit,
    setPresentation(value) {
      presentation = value;
      applyPresentation();
    },
    configure(value) {
      if (value.zoom !== zoom) {
        zoom = value.zoom;
        fit();
      }
    },
    destroy() {
      observer.disconnect();
    },
  };
}
