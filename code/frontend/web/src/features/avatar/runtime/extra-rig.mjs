import { planRigPose } from './rig-pose-contract.mjs';

/** The 5.3 SDK has its own realm and context; the parent owns all frame timing. */
export function createExtraRig({ host, primaryCanvas, model, clock, layout }) {
  let frame, loading, api, disposed = false, selected = 'original', request = 0;
  let cancelLoad;
  let target = {}, lean = 0, fromLean = 0, leanStarted = 0;
  const restore = () => {
    selected = 'original'; target = {}; lean = 0;
    primaryCanvas.style.visibility = '';
    model.visible = true;
    if (frame) frame.style.visibility = 'hidden';
  };
  async function load() {
    if (api) return api;
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      frame = document.createElement('iframe');
      frame.title = 'Rig extra de Kurisu'; frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.className = 'avatar-extra-rig';
      frame.style.visibility = 'hidden';
      const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao carregar o rig extra.')), 20000);
      cancelLoad = () => { clearTimeout(timeout); reject(new Error('Avatar encerrado.')); };
      frame.onload = async () => {
        try {
          const realm = frame.contentWindow;
          if (!realm.extraRigReady) throw new Error('O runtime do rig extra não está disponível.');
          const info = await realm.extraRigReady;
          if (disposed) throw new Error('Avatar encerrado.');
          const parameters = {
            ids: info.parameters.map(p => p.id),
            minimumValues: info.parameters.map(p => p.min),
            maximumValues: info.parameters.map(p => p.max),
          };
          api = { ...realm.extraRig, core: { getModel: () => ({ parameters }) } };
          planRigPose(api.core, 'hand-on-hip');
          resolve(api);
        } catch (error) { reject(error); }
        finally { clearTimeout(timeout); cancelLoad = undefined; }
      };
      frame.src = '/live2d/extra-runtime/index.html'; host.append(frame);
    }).catch(error => {
      frame?.remove(); frame = undefined; api = undefined; loading = undefined;
      restore(); throw error;
    });
    return loading;
  }
  async function select(pose) {
    const revision = ++request;
    if (pose === 'original') { restore(); clock.drawStill(); return true; }
    const rig = await load();
    if (disposed || revision !== request) return false;
    const next = planRigPose(rig.core, pose);
    // ArmPose is a discrete authored variant. Do not sweep through unrelated
    // intermediate variants when changing crossed -> pointing, for example.
    fromLean = next.ParamArmPose === target.ParamArmPose ? lean : 0;
    leanStarted = clock.elapsed;
    target = next; selected = pose;
    frame.style.visibility = ''; primaryCanvas.style.visibility = 'hidden'; model.visible = false;
    update(); clock.drawStill(); return true;
  }
  function update() {
    if (!api || disposed || selected === 'original') return;
    const t = clock.running ? Math.min(1, (clock.elapsed - leanStarted) / 450) : 1;
    lean = fromLean + (target.ParamLeanForward - fromLean) * t * t * (3 - 2*t);
    const core = model.internalModel.coreModel, raw = core.getModel().parameters;
    const parameters = Object.fromEntries(raw.ids.map(id => [id, core.getParameterValueById(id)]));
    const style = getComputedStyle(host);
    api.draw({ parameters: { ...parameters, ...target, ParamLeanForward: lean },
      zoom: preferences.zoom, framing: parseFloat(style.getPropertyValue('--avatar-framing')) || 1.4,
      top: parseFloat(style.getPropertyValue('--avatar-top')) || .12,
      presentation: layout.presentation });
  }
  let preferences = { zoom: 100 };
  return {
    select, update, get selected() { return selected; },
    configure(value) { preferences = { ...preferences, ...value }; update(); },
    destroy() { disposed = true; request++; cancelLoad?.(); restore(); api?.destroy(); frame?.remove(); },
  };
}
