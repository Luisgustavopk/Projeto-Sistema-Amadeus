import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  inspectPoseRig,
  planRigPose,
} from '../src/features/avatar/runtime/rig-pose-contract.mjs';
const ranges = JSON.parse(
  fs.readFileSync(
    new URL('../../assets/avatar/acting/ranges.json', import.meta.url),
    'utf8',
  ),
);
test('future poses reject absent physical parameters instead of creating virtual Cubism indices', () => {
  const core = {
    getModel: () => ({
      parameters: {
        ids: Object.keys(ranges),
        minimumValues: Object.values(ranges).map((r) => r[0]),
        maximumValues: Object.values(ranges).map((r) => r[1]),
      },
    }),
    getParameterIndex: () => 999,
  };
  assert.deepEqual(inspectPoseRig(core), {
    ready: false,
    missing: ['ParamArmPose', 'ParamLeanForward'],
    incompatible: [],
  });
  assert.throws(() => planRigPose(core, 'lean-forward'), /novo rig/);
  const exported = {
    getModel: () => ({
      parameters: {
        ids: ['ParamArmPose', 'ParamLeanForward'],
        minimumValues: [0, 0],
        maximumValues: [3, 1],
      },
    }),
  };
  assert.deepEqual(planRigPose(exported, 'lean-forward'), {
    ParamArmPose: 2,
    ParamLeanForward: 1,
  });
  exported.getModel = () => ({
    parameters: {
      ids: ['ParamArmPose', 'ParamLeanForward'],
      minimumValues: [0, 0],
      maximumValues: [1, 1],
    },
  });
  assert.deepEqual(inspectPoseRig(exported).incompatible, ['ParamArmPose']);
  assert.throws(() => planRigPose(core, 'unknown'), /desconhecida/);
});
