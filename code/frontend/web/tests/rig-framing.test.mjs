import test from 'node:test';
import assert from 'node:assert/strict';
import { calibratedProjection } from '../src/features/avatar/runtime/rig-framing.mjs';

test('unequal canvas heights preserve facial size and position across desktop, mobile and zoom', () => {
  const native = { width: .202, x: -.010907, y: .8495 };
  const extra = { width: .23495, x: -.02215, y: .49926 };
  for (const [width,height] of [[1000,1000],[390,844]]) for(const zoom of [80,100,140]) {
    const framing = 1.75, top = .075, nativeHeight = 2.35;
    const presentation = { scale:1.07,x:.02,y:-.03 };
    const p = calibratedProjection({native,extra,nativeHeight,width,height,zoom,framing,top,presentation});
    const units = framing * zoom / 100 * presentation.scale / nativeHeight;
    assert.ok(Math.abs(p.xScale * extra.width * width/2 - units*native.width*height) < 1e-6);
    assert.ok(Math.abs(p.yScale*height/p.xScale/width - 1) < 1e-6);
    assert.ok(Math.abs(p.y+p.yScale*extra.y - (1-2*(top+framing*zoom/200+presentation.y)+2*units*native.y)) < 1e-6);
  }
});
