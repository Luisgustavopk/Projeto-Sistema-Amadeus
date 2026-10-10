// One private ticker owns simulation time and drawing. Never enable the
// Live2D shared ticker: its setter adds listeners on every assignment.
export function createAvatarClock(app, model, beforeRender = () => {}) {
  let running = false;
  let elapsed = 0;
  function advance() {
    const delta = Math.min(50, Math.max(0, app.ticker.deltaMS));
    elapsed += delta;
    beforeRender();
    model.update(delta);
  }
  app.ticker.add(advance, undefined, 25);
  function drawStill() {
    if (running) return;
    elapsed += 1;
    beforeRender();
    model.update(1);
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
