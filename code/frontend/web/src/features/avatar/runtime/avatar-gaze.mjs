export function createAvatarGaze({ model, host, isActive }) {
  const surface = host.closest('main') ?? host;
  const controller = model.internalModel.focusController;
  let tracking = true;
  controller.update = function (milliseconds) {
    const elapsed = Number.isFinite(milliseconds)
      ? Math.max(0, Math.min(50, milliseconds))
      : 0;
    const blend = 1 - Math.exp(-elapsed / 150);
    this.x += (this.targetX - this.x) * blend;
    this.y += (this.targetY - this.y) * blend;
    this.vx = this.vy = 0;
  };
  const reset = () => controller.focus(0, 0);
  function follow(event) {
    if (!isActive() || !tracking || event.pointerType === 'touch') return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    controller.focus(
      clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 2)) *
        0.45,
      clamp(
        (rect.top + rect.height * 0.3 - event.clientY) / (rect.height / 2),
      ) * 0.3,
    );
  }
  surface.addEventListener('pointermove', follow, { passive: true });
  surface.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  return {
    reset,
    configure(value) {
      tracking = value.tracking;
      if (!tracking) reset();
    },
    destroy() {
      surface.removeEventListener('pointermove', follow);
      surface.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
    },
  };
}
