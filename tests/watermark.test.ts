import test from 'node:test';
import assert from 'node:assert/strict';
import { placements, type MarkOptions } from '../src/lib/watermark.ts';

const defaults: MarkOptions = {
  size: 30,
  opacity: 70,
  margin: 3,
  angle: 0,
  position: '2-2',
  repeat: false,
};
test('rotated watermarks fit all nine anchors, including tall and wide logos', () => {
  for (const ratio of [0.001, 0.5, 2, 1000])
    for (const angle of [-180, -45, 0, 30, 90, 180])
      for (let col = 0; col < 3; col++)
        for (let row = 0; row < 3; row++) {
          const p = placements(400, 300, ratio, {
            ...defaults,
            angle,
            position: `${col}-${row}`,
          })[0];
          const a = (angle * Math.PI) / 180;
          const halfW = (Math.abs(p.w * Math.cos(a)) + Math.abs(p.h * Math.sin(a))) / 2;
          const halfH = (Math.abs(p.w * Math.sin(a)) + Math.abs(p.h * Math.cos(a))) / 2;
          assert.ok(p.x - halfW >= 9 - 1e-8 && p.x + halfW <= 391 + 1e-8);
          assert.ok(p.y - halfH >= 9 - 1e-8 && p.y + halfH <= 291 + 1e-8);
        }
});
test('tiling bounds placement count for extreme logo proportions', () => {
  for (const ratio of [0.001, 1, 1000]) {
    const points = placements(12000, 12000, ratio, { ...defaults, size: 5, repeat: true });
    assert.ok(points.length > 0 && points.length <= 144);
  }
});
