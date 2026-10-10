export function createAvatarGaze({ model, host, isActive }) {
  const surface = host.closest('main') ?? host;
  const controller = model.internalModel.focusController;
  let tracking = true;
  let suppressed = false;
  let lastTarget = [0, 0];
  controller.update = function (milliseconds) {
    const elapsed = Number.isFinite(milliseconds)
      ? Math.max(0, Math.min(50, milliseconds))
      : 0;
    const blend = 1 - Math.exp(-elapsed / 150);
    this.x += (this.targetX - this.x) * blend;
    this.y += (this.targetY - this.y) * blend;
    this.vx = this.vy = 0;
  };
  const reset = () => {
    lastTarget = [0, 0];
    controller.focus(0, 0);
  };
  function follow(event) {
    if (!isActive() || !tracking || event.pointerType === 'touch') return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    lastTarget = [
      clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 2)) *
        0.45,
      clamp(
        (rect.top + rect.height * 0.3 - event.clientY) / (rect.height / 2),
      ) * 0.3,
    ];
    if (!suppressed) controller.focus(...lastTarget);
  }
  surface.addEventListener('pointermove', follow, { passive: true });
  surface.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  return {
    setSuppressed(value) {
      if (value === suppressed) return;
      suppressed = value;
      if (suppressed) controller.focus(0, 0, true);
      else if (tracking) controller.focus(...lastTarget);
    },
    reset,
    configure(value) {
      tracking = value.tracking;
      if (!tracking) reset();
      else if (suppressed) controller.focus(0, 0, true);
    },
    destroy() {
      surface.removeEventListener('pointermove', follow);
      surface.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
    },
  };
}
