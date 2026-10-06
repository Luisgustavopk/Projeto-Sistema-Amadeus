const PIXI = window.PIXI;
const panels = [];
const names = {
  "Arm Change": "Trocar braços",
  "Blush 1": "Rubor discreto",
  "Blush 2": "Rubor intenso",
  "Stanby Angry": "Irritação",
  "Stanby Sad": "Tristeza",
  "Stanby Scared": "Medo",
  "Stanby Smile": "Sorriso",
  "Stanby Surprised": "Surpresa",
};

function status(panel, message, failed = false) {
  panel.querySelector(".status").textContent = message;
  panel.querySelector(".status").classList.toggle("error", failed);
}

function option(select, value, text) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = text;
  select.append(item);
}

async function load(id, path, modern) {
  const panel = document.getElementById(id);
  try {
    if (!PIXI?.live2d) throw new Error("Runtime Live2D não carregou.");
    PIXI.live2d.config.sound = false;
    const setting = await fetch(path).then((r) => {
      if (!r.ok) throw new Error("Arquivo do modelo indisponível.");
      return r.json();
    });
    setting.url = path;
    const motions = modern ? setting.FileReferences.Motions : setting.motions;
    for (const group of Object.values(motions)) {
      for (const motion of group) {
        delete motion.sound;
        delete motion.Sound;
      }
    }
    const model = await PIXI.live2d.Live2DModel.from(setting, {
      autoInteract: false,
      motionPreload: "IDLE",
    });
    const stage = panel.querySelector(".stage");
    const app = new PIXI.Application({
      view: panel.querySelector("canvas"),
      resizeTo: stage,
      backgroundColor: 0xeae4da,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    app.ticker.maxFPS = 30;
    app.stage.addChild(model);
    model.anchor.set(0.5, 0.5);
    const zoom = panel.querySelector(".zoom");
    const fit = () => {
      const scale =
        Math.min(
          stage.clientWidth / model.internalModel.width,
          stage.clientHeight / model.internalModel.height,
        ) *
        0.95 *
        Number(zoom.value);
      model.scale.set(scale);
      model.position.set(stage.clientWidth / 2, stage.clientHeight / 2);
    };
    fit();
    new ResizeObserver(fit).observe(stage);
    zoom.addEventListener("input", fit);
    panel.querySelector(".reset").addEventListener("click", () => {
      zoom.value = "1";
      fit();
      model.focus(0, 0, true);
    });
    let paused = false;
    panel.querySelector(".pause").addEventListener("click", (event) => {
      paused = !paused;
      model.autoUpdate = !paused;
      event.target.textContent = paused
        ? "Retomar animação"
        : "Pausar animação";
    });
    const expression = panel.querySelector(".expression");
    option(expression, "", "Expressão padrão");
    const expressions = modern
      ? setting.FileReferences.Expressions
      : setting.expressions;
    for (const e of expressions) {
      const name = modern ? e.Name : e.name;
      option(expression, name, names[name] ?? name);
    }
    expression.addEventListener("change", async () => {
      if (expression.value) await model.expression(expression.value);
      else
        model.internalModel.motionManager.expressionManager.resetExpression();
      status(panel, `Expressão: ${expression.selectedOptions[0].textContent}`);
    });
    const motionSelect = panel.querySelector(".motion");
    for (const [group, entries] of Object.entries(motions)) {
      entries.forEach((_, index) =>
        option(
          motionSelect,
          JSON.stringify([group, index]),
          `${group} · ${index + 1}`,
        ),
      );
    }
    panel.querySelector(".play").addEventListener("click", async () => {
      const [group, index] = JSON.parse(motionSelect.value);
      try {
        const played = await model.motion(group, index, 3);
        status(
          panel,
          played
            ? `Movimento: ${group} · ${index + 1}`
            : "Movimento não iniciou; tente novamente.",
        );
      } catch (error) {
        status(panel, `Falha no movimento: ${error.message}`, true);
      }
    });
    const mouth = panel.querySelector(".mouth");
    model.internalModel.on("beforeModelUpdate", () => {
      if (!mouth.checked) return;
      const value = Math.max(0, Math.sin(performance.now() / 110)) * 0.65;
      const core = model.internalModel.coreModel;
      if (modern) core.setParameterValueById("ParamMouthOpenY", value);
      else core.setParamFloat("PARAM_MOUTH_OPEN_Y", value);
    });
    let dragging;
    app.view.addEventListener("pointerdown", (event) => {
      dragging = {
        x: event.clientX,
        y: event.clientY,
        modelX: model.x,
        modelY: model.y,
      };
      app.view.setPointerCapture(event.pointerId);
    });
    app.view.addEventListener("pointermove", (event) => {
      if (dragging)
        model.position.set(
          dragging.modelX + event.clientX - dragging.x,
          dragging.modelY + event.clientY - dragging.y,
        );
    });
    app.view.addEventListener("pointerup", () => {
      dragging = undefined;
    });
    panel.querySelectorAll("button, select, input").forEach((control) => {
      control.disabled = false;
    });
    status(
      panel,
      "Renderizado · arraste o desenho para ajustar o enquadramento.",
    );
    panels.push({ panel, app, model });
    if (panels.length === 2) document.getElementById("save").disabled = false;
  } catch (error) {
    status(panel, `Não foi possível renderizar: ${error.message}`, true);
    console.error(error);
  }
}

document.getElementById("save").addEventListener("click", () => {
  const ordered = ["legacy", "modern"].map((id) =>
    panels.find((p) => p.panel.id === id),
  );
  const canvas = document.createElement("canvas");
  canvas.width = ordered.reduce((width, p) => width + p.app.view.width, 0);
  canvas.height = Math.max(...ordered.map((p) => p.app.view.height)) + 70;
  const context = canvas.getContext("2d");
  context.fillStyle = "#eae4da";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1a222e";
  context.font = "28px sans-serif";
  let x = 0;
  for (const p of ordered) {
    p.app.renderer.render(p.app.stage);
    context.fillText(p.panel.querySelector("h2").textContent, x + 25, 45);
    context.drawImage(p.app.view, x, 70);
    x += p.app.view.width;
  }
  const link = document.createElement("a");
  link.download = "kurisu-comparacao.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

await Promise.all([
  load("legacy", "/assets/legacy/kurisu.model.json", false),
  load("modern", "/assets/modern/Kurisu.model3.json", true),
]);
