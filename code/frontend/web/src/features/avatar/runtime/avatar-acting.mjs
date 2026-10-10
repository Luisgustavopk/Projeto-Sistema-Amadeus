import { ACTING_CATALOG } from '../../../../../assets/avatar/acting/generated/catalog.mjs';
import { planActing } from './acting-plan.mjs';
import { samplePose, motionWeight } from './motion-pose.mjs';

const GAZE_IDS = new Set([
  'ParamAngleX',
  'ParamAngleY',
  'ParamAngleZ',
  'ParamEyeBallX',
  'ParamEyeBallY',
]);
const neutral = (blend) => (blend === 'Multiply' ? 1 : 0);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

/** One parameter layer, evaluated by the existing renderer clock. No extra ticker. */
export function createAvatarActing({
  model,
  settings,
  clock,
  signal,
  gaze,
  layout,
}) {
  const core = model.internalModel.coreModel;
  const ids = new Set(core.getModel().parameters.ids);
  const generated = new Map(
    ACTING_CATALOG.expressions.map((e) => [e.Name, e.parameters]),
  );
  const originals = new Map(
    settings.FileReferences.Expressions.map((e) => [e.Name, e.File]),
  );
  const cached = new Map();
  let source = new Map(),
    target = new Map(),
    started = 0,
    duration = 450;
  let arms = 0,
    armFrom = 0,
    armTarget = 0,
    armStart = 0;
  let motionUntil = 0,
    revision = 0,
    disposed = false;
  let activeMotion;
  function motionFrame() {
    if (!activeMotion || clock.elapsed >= motionUntil) {
      activeMotion = undefined;
      return null;
    }
    const seconds = (clock.elapsed - activeMotion.started) / 1000;
    const entry = activeMotion.entry;
    return {
      entry,
      seconds,
      weight: motionWeight(seconds, entry.duration, entry.FadeOutTime),
    };
  }
  const current = () => {
    const t = ease(
      Math.min(1, Math.max(0, (clock.elapsed - started) / duration)),
    );
    const result = new Map();
    for (const [id, p] of new Map([...source, ...target])) {
      const a = source.get(id)?.Value ?? neutral(p.Blend);
      const b = target.get(id)?.Value ?? neutral(p.Blend);
      result.set(id, { ...p, Value: lerp(a, b, t) });
    }
    return result;
  };
  function set(parameters) {
    for (const p of parameters)
      if (
        !ids.has(p.Id) ||
        !Number.isFinite(p.Value) ||
        !['Add', 'Multiply', 'Overwrite'].includes(p.Blend)
      )
        throw new TypeError(`Parâmetro inválido: ${p.Id}`);
    if (JSON.stringify([...target.values()]) === JSON.stringify(parameters))
      return;
    source = current();
    target = new Map(parameters.map((p) => [p.Id, p]));
    started = clock.elapsed - (clock.running ? 0 : duration);
    clock.drawStill();
  }
  async function select(name) {
    const request = ++revision;
    if (name === null || name === 'kz_neutra') {
      set([]);
      return true;
    }
    let parameters = generated.get(name);
    if (!parameters) {
      const file = originals.get(name);
      if (!file) return false;
      if (!cached.has(name))
        cached.set(
          name,
          fetch(new URL(file, settings.url), { signal })
            .then(async (response) => {
              if (!response.ok)
                throw new Error('Expressão local indisponível.');
              return (await response.json()).Parameters;
            })
            .catch((error) => {
              cached.delete(name);
              throw error;
            }),
        );
      parameters = await cached.get(name);
    }
    if (disposed || request !== revision) return false;
    // Hand pose is independent of the face and survives later face changes.
    if (name === 'Arm Change') {
      setArms(true);
      return true;
    }
    set(parameters);
    return true;
  }
  function setArms(value) {
    if (armTarget === (value ? 1 : 0)) return;
    armFrom = arms;
    armTarget = value ? 1 : 0;
    armStart = clock.elapsed - (clock.running ? 0 : duration);
    clock.drawStill();
  }
  return {
    select,
    react(event) {
      if (disposed) return false;
      revision++;
      const plan = planActing(event, ACTING_CATALOG);
      set(plan.parameters);
      return true;
    },
    setArms,
    async motion(name) {
      const index = ACTING_CATALOG.motions.findIndex((m) => m.Name === name);
      if (index < 0 || disposed || !clock.running) return false;
      const entry = ACTING_CATALOG.motions[index];
      motionUntil = clock.elapsed + (entry.duration + entry.FadeOutTime) * 1000;
      gaze.setSuppressed(true);
      const accepted = await model.motion('Amadeus', index, 3);
      if (!accepted) {
        motionUntil = 0;
        activeMotion = undefined;
      }
      if (accepted && !disposed) {
        activeMotion = { entry, started: clock.elapsed };
        motionUntil =
          clock.elapsed + (entry.duration + entry.FadeOutTime) * 1000;
      }
      return accepted && !disposed;
    },
    updatePresentation() {
      const frame = motionFrame();
      const p = frame?.entry.presentation;
      layout?.setPresentation(
        p
          ? {
              scale: samplePose(p.scale, frame.seconds),
              x: samplePose(p.x, frame.seconds),
              y: samplePose(p.y, frame.seconds),
            }
          : { scale: 1, x: 0, y: 0 },
      );
    },
    update() {
      const values = current();
      const frame = motionFrame();
      let ownsGaze = clock.elapsed < motionUntil;
      for (const [id, p] of values) {
        const ownership = frame?.entry.pose[id] ? frame.weight : 0;
        const amount = lerp(neutral(p.Blend), p.Value, 1 - ownership);
        const value =
          p.Blend === 'Multiply'
            ? core.getParameterValueById(id) * amount
            : p.Blend === 'Overwrite'
              ? lerp(core.getParameterValueById(id), p.Value, 1 - ownership)
              : core.getParameterValueById(id) + amount;
        core.setParameterValueById(id, value);
        if (GAZE_IDS.has(id) && Math.abs(p.Value - neutral(p.Blend)) > 0.001)
          ownsGaze = true;
      }
      arms = lerp(
        armFrom,
        armTarget,
        ease(Math.min(1, Math.max(0, (clock.elapsed - armStart) / duration))),
      );
      core.setParameterValueById('HandChange', arms);
      // Native movement curves precede physics and eye blinking. Give the
      // authored pose its final ownership here so these cannot erase it.
      if (frame)
        for (const [id, points] of Object.entries(frame.entry.pose)) {
          core.setParameterValueById(
            id,
            lerp(
              core.getParameterValueById(id),
              samplePose(points, frame.seconds),
              frame.weight,
            ),
          );
        }
      gaze.setSuppressed(ownsGaze);
      if (clock.elapsed - started >= duration) source = target;
      return { mouth: Boolean(frame?.entry.pose.ParamMouthOpenY) };
    },
    destroy() {
      disposed = true;
      revision++;
      cached.clear();
      model.internalModel.motionManager.stopAllMotions();
      activeMotion = undefined;
      motionUntil = 0;
      layout?.setPresentation({ scale: 1, x: 0, y: 0 });
      gaze.setSuppressed(false);
    },
  };
}
