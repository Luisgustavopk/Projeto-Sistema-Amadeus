export function createAvatarLayout({ app, model, host }) {
  let zoom = 100;
  let width = 0;
  let height = 0;
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
    model.scale.set(targetHeight / model.internalModel.height);
    model.position.set(width / 2, height * top + targetHeight / 2);
  }
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  return {
    fit,
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
