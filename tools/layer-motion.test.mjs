import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP_SEQUENCE, ENTRANCE_DURATION, sampleDrop, takeImpact } from '../dist/layer-motion.js';

test('layers fall under acceleration at full size and land in stacking order', () => {
  let previousImpact = 0;
  for (const layer of DROP_SEQUENCE) {
    assert.equal(sampleDrop(layer, layer.delay - .01).visible, false);
    const start = sampleDrop(layer, layer.delay), half = sampleDrop(layer, layer.delay + layer.duration * .5), late = sampleDrop(layer, layer.delay + layer.duration * .9);
    assert.equal(start.offset, layer.sky); assert.equal(half.scaleY, 1); assert.equal(late.scaleY, 1);
    assert.ok(half.offset > late.offset && late.offset > 0);
    assert.ok((half.offset - late.offset) / .4 > (start.offset - half.offset) / .5, 'descent accelerates');
    const impactAt = layer.delay + layer.duration;
    assert.ok(impactAt > previousImpact); previousImpact = impactAt;
    assert.ok(Math.abs(sampleDrop(layer, impactAt).offset) < 1e-12);
    assert.ok(sampleDrop(layer, impactAt).scaleY < 1);
    assert.ok(sampleDrop(layer, impactAt + .1).offset > 0, 'landing rebounds');
  }
});

test('every layer settles exactly with finite, nonnegative height throughout the sequence', () => {
  for (const layer of DROP_SEQUENCE) {
    for (let time = 0; time < ENTRANCE_DURATION; time += .013) {
      const state = sampleDrop(layer, time);
      assert.ok(state.offset >= 0); assert.ok(state.scaleY > .8 && state.scaleY < 1.2);
      for (const key of ['offset', 'drift', 'tilt', 'twist', 'scaleY']) assert.ok(Number.isFinite(state[key]));
    }
    const settled = sampleDrop(layer, ENTRANCE_DURATION + .01);
    assert.equal(settled.offset, 0); assert.equal(settled.scaleY, 1); assert.equal(settled.tilt, 0); assert.equal(settled.twist, 0);
  }
});

test('slow frames fire each impact once; restarting permits the impact again', () => {
  const layer = { ...DROP_SEQUENCE[0], impacted: false };
  assert.equal(takeImpact(layer, 0), false);
  assert.equal(takeImpact(layer, ENTRANCE_DURATION), true);
  assert.equal(takeImpact(layer, ENTRANCE_DURATION + 1), false);
  layer.impacted = false;
  assert.equal(takeImpact(layer, layer.delay + layer.duration), true);
});
