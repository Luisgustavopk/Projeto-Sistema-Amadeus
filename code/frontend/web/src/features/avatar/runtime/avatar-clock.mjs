// One private ticker owns simulation time and drawing. Never enable the
// Live2D shared ticker: its setter adds listeners on every assignment.
export function createAvatarClock(app, model) {
  let running = false;
  function advance() {
    model.update(Math.min(50, Math.max(0, app.ticker.deltaMS)));
  }
  app.ticker.add(advance, undefined, 25);
  function drawStill() {
    if (running) return;
    model.update(1);
    app.renderer.render(app.stage);
  }
  return {
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
