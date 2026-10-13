// One private ticker owns simulation time and drawing. Never enable the
// Live2D shared ticker: its setter adds listeners on every assignment.
export function createAvatarClock(app, model, beforeRender = () => {}, afterUpdate = () => {}) {
  let running = false;
  let elapsed = 0;
  function simulate(milliseconds) {
    model.update(milliseconds);
    // pixi-live2d-display's update() only accumulates time. Its _render()
    // normally advances the core, but _render is skipped for a hidden model.
    // Advance the core explicitly, then consume the pending delta so the
    // subsequent Pixi draw cannot simulate the same frame a second time.
    if (model.internalModel?.update) {
      model.internalModel.update(model.deltaTime, model.elapsedTime);
      model.deltaTime = 0;
    }
  }
  function advance() {
    const delta = Math.min(50, Math.max(0, app.ticker.deltaMS));
    elapsed += delta;
    beforeRender();
    simulate(delta);
    afterUpdate();
  }
  app.ticker.add(advance, undefined, 25);
  function drawStill() {
    if (running) return;
    elapsed += 1;
    beforeRender();
    simulate(1);
    afterUpdate();
    app.renderer.render(app.stage);
  }
  return {
    get elapsed() {
      return elapsed;
    },
    get running() {
      return running;
    },
    setRunning(value) {
      if (running === value) return;
      running = value;
      if (running) app.ticker.start();
      else {
        app.ticker.stop();
        drawStill();
      }
    },
    drawStill,
    destroy() {
      app.ticker.stop();
      app.ticker.remove(advance);
    },
  };
}
