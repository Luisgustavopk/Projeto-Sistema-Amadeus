/** Future authoring contract. Not bound to the current compiled avatar. */
export const RIG_POSES = Object.freeze({
  'arms-crossed': Object.freeze({ ParamArmPose: 1, ParamLeanForward: 0 }),
  'hand-on-hip': Object.freeze({ ParamArmPose: 2, ParamLeanForward: 0 }),
  'idea-pointing': Object.freeze({ ParamArmPose: 3, ParamLeanForward: 0 }),
  'lean-forward': Object.freeze({ ParamArmPose: 2, ParamLeanForward: 1 }),
});

export function inspectPoseRig(core) {
  const p = core.getModel().parameters;
  const expected = { ParamArmPose: [0, 3], ParamLeanForward: [0, 1] };
  const missing = [],
    incompatible = [];
  for (const [id, [min, max]] of Object.entries(expected)) {
    const index = p.ids.indexOf(id);
    if (index < 0) missing.push(id);
    else if (
      !Number.isFinite(p.minimumValues[index]) ||
      !Number.isFinite(p.maximumValues[index]) ||
      p.minimumValues[index] > min ||
      p.maximumValues[index] < max
    )
      incompatible.push(id);
  }
  return {
    ready: !missing.length && !incompatible.length,
    missing,
    incompatible,
  };
}

/** Build a target only. Applying it requires the future reviewed motion layer. */
export function planRigPose(core, pose) {
  if (!Object.hasOwn(RIG_POSES, pose))
    throw new TypeError('Pose desconhecida.');
  const status = inspectPoseRig(core);
  if (!status.ready)
    throw new Error(
      'O modelo precisa de um novo rig: ' +
        [...status.missing, ...status.incompatible].join(', '),
    );
  return { ...RIG_POSES[pose] };
}
