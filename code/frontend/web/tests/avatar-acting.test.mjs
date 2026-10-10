import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTING_CATALOG } from '../../assets/avatar/acting/generated/catalog.mjs';
import { planActing } from '../src/features/avatar/runtime/acting-plan.mjs';
import { createAvatarActing } from '../src/features/avatar/runtime/avatar-acting.mjs';

const root = new URL('../../assets/avatar/acting/', import.meta.url);
const ranges = JSON.parse(
  fs.readFileSync(new URL('ranges.json', root), 'utf8'),
);
test('all generated faces match the merged expression contract and calibrated parameter ranges', () => {
  const schema = fs.readFileSync(
    new URL(
      '../../../backend/api/src/domain/persona/expression.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const enumValues = (name) =>
    [
      ...schema
        .match(new RegExp(name + ':\\s*z\\.enum\\(\\[([\\s\\S]*?)\\]\\)'))[1]
        .matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1]);
  assert.deepEqual(ACTING_CATALOG.emotions, enumValues('emotion'));
  assert.deepEqual(ACTING_CATALOG.intents, enumValues('intent'));
  assert.equal(ACTING_CATALOG.expressions.length, 177);
  assert.equal(
    new Set(ACTING_CATALOG.expressions.map((e) => e.Name)).size,
    177,
  );
  for (const e of ACTING_CATALOG.expressions)
    for (const p of e.parameters) {
      assert.ok(ranges[p.Id], `${e.Name}: unknown ${p.Id}`);
      assert.ok(p.Value >= ranges[p.Id][0] && p.Value <= ranges[p.Id][1]);
      assert.notEqual(p.Id, 'ParamMouthOpenY');
    }
  for (const m of ACTING_CATALOG.motions) {
    const data = JSON.parse(
      fs.readFileSync(new URL('generated/' + m.File, root), 'utf8'),
    );
    for (const c of data.Curves) {
      const values = [c.Segments[1]];
      for (let i = 2; i < c.Segments.length; i += 7)
        values.push(c.Segments[i + 2], c.Segments[i + 4], c.Segments[i + 6]);
      assert.ok(
        values.every(
          (v) =>
            Number.isFinite(v) && v >= ranges[c.Id][0] && v <= ranges[c.Id][1],
        ),
      );
    }
    for (const [id, points] of Object.entries(m.pose))
      for (const [time, value] of points) {
        assert.ok(Number.isFinite(time) && time >= 0 && time <= m.duration);
        assert.ok(
          Number.isFinite(value) &&
            value >= ranges[id][0] &&
            value <= ranges[id][1],
        );
      }
    if (m.presentation) {
      for (const [key, points] of Object.entries(m.presentation)) {
        assert.equal(points[0][1], key === 'scale' ? 1 : 0);
        assert.equal(points.at(-1)[1], key === 'scale' ? 1 : 0);
        for (const [, v] of points)
          assert.ok(
            Number.isFinite(v) &&
              (key === 'scale' ? v >= 0.85 && v <= 1.2 : Math.abs(v) <= 0.15),
          );
      }
    }
  }
});
test('gratitude preserves a sad face; an accent cannot overwrite owned emotional parameters', () => {
  const event = { emotion: 'tristeza', intent: 'agradecer', intensity: 0.8 };
  const plan = planActing(event, ACTING_CATALOG);
  assert.equal(plan.accent, undefined);
  assert.equal(plan.parameters.find((p) => p.Id === 'Sad').Value, 0.8);
  const curiosity = planActing(
    { emotion: 'curiosidade', intent: 'refletir', intensity: 0.8 },
    ACTING_CATALOG,
  );
  assert.equal(
    curiosity.parameters.find((p) => p.Id === 'ParamEyeBallY').Value,
    0.2,
  );
  assert.equal(
    new Set(curiosity.parameters.map((p) => p.Id)).size,
    curiosity.parameters.length,
  );
  assert.throws(() => planActing({ ...event, intensity: NaN }, ACTING_CATALOG));
  assert.throws(() =>
    planActing({ ...event, emotion: 'inventada' }, ACTING_CATALOG),
  );
});
function fixture() {
  const values = new Map(Object.entries(ranges).map(([id, r]) => [id, r[2]]));
  const clock = { elapsed: 0, running: false, drawStill() {} };
  let suppressed = false;
  const core = {
    getModel: () => ({ parameters: { ids: [...values.keys()] } }),
    getParameterValueById: (id) => values.get(id),
    setParameterValueById: (id, value) =>
      values.set(id, Math.max(ranges[id][0], Math.min(ranges[id][1], value))),
  };
  const model = {
    internalModel: { coreModel: core, motionManager: { stopAllMotions() {} } },
    motion: async () => true,
  };
  const actor = createAvatarActing({
    model,
    clock,
    settings: {
      url: 'http://127.0.0.1/model.json',
      FileReferences: { Expressions: [] },
    },
    signal: new AbortController().signal,
    gaze: {
      setSuppressed: (value) => {
        suppressed = value;
      },
    },
    layout: {
      setPresentation(value) {
        presentation = value;
      },
    },
  });
  let presentation = { scale: 1, x: 0, y: 0 };
  function frame() {
    for (const [id, r] of Object.entries(ranges)) values.set(id, r[2]);
    actor.updatePresentation();
    return actor.update();
  }
  return {
    actor,
    clock,
    values,
    frame,
    get suppressed() {
      return suppressed;
    },
    get presentation() {
      return presentation;
    },
  };
}
test('all 177 expressions stay finite, release previous states, and preserve the separate arm pose', async () => {
  const f = fixture();
  f.actor.setArms(true);
  for (const e of ACTING_CATALOG.expressions) {
    assert.equal(await f.actor.select(e.Name), true);
    f.frame();
    assert.equal(f.values.get('HandChange'), 1);
    assert.ok([...f.values.values()].every(Number.isFinite));
  }
  await f.actor.select('kz_raiva_forte');
  f.frame();
  assert.equal(f.values.get('Angry'), 1);
  await f.actor.select(null);
  f.frame();
  assert.equal(f.values.get('Angry'), 0);
  assert.equal(f.values.get('HandChange'), 1);
  f.actor.setArms(false);
  f.frame();
  assert.equal(f.values.get('HandChange'), 0);
});
test('movement owns eyelids and reaction, then restores selected face and framing', async () => {
  const f = fixture();
  f.clock.running = true;
  await f.actor.select('kz_alegria_forte');
  f.clock.elapsed = 500;
  f.frame();
  assert.equal(await f.actor.motion('kz_virar_emburrada'), true);
  f.clock.elapsed += 650;
  f.frame();
  assert.equal(f.values.get('ParamEyeLOpen'), 0);
  assert.equal(f.values.get('ParamEyeROpen'), 0);
  assert.equal(f.values.get('ParamAngleX'), -28);
  assert.equal(f.values.get('Smile'), 0);
  assert.equal(f.suppressed, true);
  for (let i = 0; i < 20; i++) f.frame();
  assert.equal(f.values.get('ParamAngleX'), -28);
  f.clock.elapsed += 4000;
  f.frame();
  assert.equal(f.suppressed, false);
  assert.ok(f.values.get('Smile') > 0);
  await f.actor.motion('kz_inclinar_para_frente');
  f.clock.elapsed += 700;
  assert.equal(f.frame().mouth, true);
  assert.equal(f.presentation.scale, 1.18);
  assert.equal(f.values.get('ParamEyeLOpen'), 0);
  assert.ok(f.values.get('ParamMouthOpenY') > 0);
  f.clock.elapsed += 4000;
  assert.equal(f.frame().mouth, false);
  assert.deepEqual(f.presentation, { scale: 1, x: 0, y: 0 });
});
test('surprise uses a facial reaction; light arm gesture releases its temporary hand pose', async () => {
  const f = fixture();
  f.actor.setArms(true);
  f.frame();
  await f.actor.select('kz_tristeza_forte');
  f.frame();
  f.clock.running = true;
  await f.actor.motion('kz_surpresa_recuo');
  f.clock.elapsed += 300;
  f.frame();
  assert.equal(f.values.get('Surprissed'), 1);
  assert.equal(f.values.get('Sad'), 0);
  assert.ok(f.values.get('ParamMouthOpenY') > 0.4);
  assert.ok(f.presentation.scale < 0.92);
  f.clock.elapsed += 3500;
  f.frame();
  assert.ok(f.values.get('Sad') > 0);
  await f.actor.motion('kz_abrir_bracos_leve');
  f.clock.elapsed += 800;
  f.frame();
  assert.equal(f.values.get('HandChange'), 0);
  assert.equal(f.values.get('UpperArmLPhy'), -8);
  f.clock.elapsed += 4000;
  f.frame();
  assert.equal(f.values.get('HandChange'), 1);
  assert.equal(await f.actor.motion('kz_risada_balanco'), false);
});
test('transitions fade without accumulating offsets; gaze resumes when a motion ends', async () => {
  const f = fixture();
  f.clock.running = true;
  await f.actor.select('kz_vergonha_forte');
  f.clock.elapsed = 450;
  f.frame();
  assert.equal(f.values.get('ParamCheek'), 1);
  assert.equal(f.suppressed, true);
  for (let i = 0; i < 10; i++) f.frame();
  assert.equal(f.values.get('ParamAngleX'), 12);
  await f.actor.select(null);
  f.clock.elapsed = 675;
  f.frame();
  assert.equal(f.values.get('ParamCheek'), 0.5);
  f.clock.elapsed = 900;
  f.frame();
  assert.equal(f.values.get('ParamCheek'), 0);
  assert.equal(f.suppressed, false);
  assert.equal(await f.actor.motion('kz_negar_cabeca'), true);
  f.frame();
  assert.equal(f.suppressed, true);
  f.clock.elapsed += 2400;
  f.frame();
  assert.equal(f.suppressed, false);
  f.actor.destroy();
  assert.equal(await f.actor.motion('kz_negar_cabeca'), false);
});
