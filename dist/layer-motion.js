// Times are in seconds and distances are world units. Each piece stays full size in flight.
export const DROP_SEQUENCE = [
  { name: 'sponge', delay: .45, duration: 1.12, sky: 10, center: .53, height: .56, mass: 1, tilt: .22 },
  { name: 'cream', delay: 1.5, duration: .98, sky: 9, center: .84, height: .125, mass: .3, tilt: -.16 },
  { name: 'sponge', delay: 2.25, duration: 1.12, sky: 10.5, center: 1.14, height: .5, mass: .9, tilt: -.2 },
  { name: 'cream', delay: 3.25, duration: .98, sky: 9, center: 1.445, height: .115, mass: .3, tilt: .15 },
  { name: 'sponge', delay: 4, duration: 1.12, sky: 10.5, center: 1.69, height: .38, mass: .85, tilt: .19 },
  { name: 'icing', delay: 5, duration: 1.06, sky: 9.5, center: 1.98, height: .3, mass: .5, tilt: -.12 },
  { name: 'candle', delay: 6.15, duration: 1.08, sky: 9.5, center: 2.73, height: 1.56, mass: .3, tilt: .16 }
];
export const SETTLE_DURATION = .95;
export const ENTRANCE_DURATION = Math.max(...DROP_SEQUENCE.map(s => s.delay + s.duration)) + SETTLE_DURATION;

export function sampleDrop(layer, time) {
  const local = time - layer.delay;
  const base = { visible: local >= 0, offset: 0, drift: 0, tilt: 0, twist: 0, scaleY: 1, landed: local >= layer.duration };
  if (local < 0) return { ...base, offset: layer.sky };
  if (local < layer.duration) {
    const u = local / layer.duration;
    return { ...base, offset: layer.sky * (1 - u * u), drift: Math.sin(u * Math.PI) * (1 - u) * .32,
      tilt: layer.tilt * Math.pow(1 - u, 1.4), twist: (1 - u) * layer.tilt * 3 };
  }
  const sinceImpact = local - layer.duration;
  if (sinceImpact >= SETTLE_DURATION) return base;
  return { ...base, offset: (.12 + layer.mass * .2) * Math.exp(-sinceImpact * 5.5) * Math.abs(Math.sin(sinceImpact * 10)),
    scaleY: 1 - .16 * layer.mass * Math.exp(-sinceImpact * 11) * Math.cos(sinceImpact * 17),
    tilt: Math.sin(sinceImpact * 13) * Math.exp(-sinceImpact * 7) * layer.tilt * .15 };
}

// Crossing the impact time fires once even after a slow frame or a pause.
export function takeImpact(layer, time) {
  if (layer.impacted || time < layer.delay + layer.duration) return false;
  layer.impacted = true;
  return true;
}
