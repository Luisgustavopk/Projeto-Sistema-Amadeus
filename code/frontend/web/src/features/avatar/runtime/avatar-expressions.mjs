export function createAvatarExpressions({ model, available, clock }) {
  let currentName = null;
  return async (name) => {
    if (name && !available.has(name)) return false;
    if (name === currentName) return true;
    const manager = model.internalModel.motionManager.expressionManager;
    if (!clock.running) manager.stopAllExpressions();
    if (name) {
      if (!(await model.expression(name))) return false;
    } else {
      manager.currentExpression = manager.defaultExpression;
      manager.resetExpression();
    }
    currentName = name;
    if (!clock.running) {
      const motion = name
        ? manager.currentExpression
        : manager.defaultExpression;
      const fade = motion.getFadeInTime();
      motion.setFadeInTime(0);
      try {
        clock.drawStill();
      } finally {
        motion.setFadeInTime(fade);
      }
    }
    return true;
  };
}
