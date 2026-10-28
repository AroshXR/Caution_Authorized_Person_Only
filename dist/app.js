import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { DROP_SEQUENCE, ENTRANCE_DURATION, sampleDrop, takeImpact } from './layer-motion.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const config = { name: '', message: '', flavour: 'chocolate' };
const defaults = "Here's to a day as wonderful as you are.\nAnd a little wish that just might come true.";
const palette = {
  chocolate: { sponge: '#65392d', edge: '#47251e', filling: '#e88dad', label: 'CHOCOLATE & A LITTLE STARDUST' },
  vanilla: { sponge: '#e5be84', edge: '#bd8b55', filling: '#e8a9bb', label: 'VANILLA & A LITTLE STARDUST' },
  strawberry: { sponge: '#cd8091', edge: '#ad5c77', filling: '#f5ced4', label: 'STRAWBERRY & A LITTLE STARDUST' }
};
let renderer, scene, camera, controls, cake, candle, flame, flameCore, glow, candleLight;
let stage = 0, litAt = -100, blownAt = -100, motionPaused = reduceMotion.matches;
let audioEnabled = false, audioContext, elapsed = 0;
let assembling = false, assemblyTime = 0, effectTime = 0, skyLight, keyLight, skyTrails;
let dust, dustPositions, dustColors, dustCursor = 0;
const dustParticles = [], impactRings = [];
let materials = {}, crumbs = [], smokePuffs = [], confetti = [], toastTimeout;
const segments = [];
const clock = new THREE.Clock();
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

function notify(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}

function chime(celebrate = false) {
  if (!audioEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const notes = celebrate ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    notes.forEach((frequency, i) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      const t = audioContext.currentTime + i * .15;
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.055, t + .015);
      gain.gain.exponentialRampToValueAtTime(.001, t + 1.5);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t + 1.6);
    });
  } catch { notify('Sound is unavailable in this browser.'); }
}

function cakeTexture(color) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 256);
  let seed = 32;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = random() > .5 ? `rgba(255,221,197,${random() * .08})` : `rgba(22,5,5,${random() * .16})`;
    ctx.beginPath(); ctx.ellipse(random() * 512, random() * 256, random() * 1.9 + .2, random() * 1.2 + .2, 0, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping; texture.repeat.set(2, 1); texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,229,151,1)'); gradient.addColorStop(.12, 'rgba(255,191,84,.8)');
  gradient.addColorStop(.32, 'rgba(255,136,60,.2)'); gradient.addColorStop(1, 'rgba(255,113,47,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function mesh(geometry, material, parent = cake, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

function icingGeometry(radius, topY) {
  const positions = [], indices = [], uv = [], sides = 192, rows = 12;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2;
      let drip = .12;
      for (let k = 0; k < 15; k++) {
        const center = k / 15 * Math.PI * 2 + .07 * Math.sin(k * 13);
        let delta = Math.abs(a - center); delta = Math.min(delta, Math.PI * 2 - delta);
        drip += (.16 + .22 * (.5 + .5 * Math.sin(k * 9))) * Math.exp(-Math.pow(delta / (.062 + .022 * Math.sin(k * 3)), 2));
      }
      const bulge = Math.sin(t * Math.PI) * .027 + .014 * Math.sin(a * 12);
      const r = radius + .025 + bulge - .028 * smooth((t - .75) * 4);
      positions.push(Math.cos(a) * r, topY - t * drip, Math.sin(a) * r);
      uv.push(i / sides, t);
      if (j < rows && i < sides) { const p = j * (sides + 1) + i; indices.push(p, p + 1, p + sides + 1, p + 1, p + sides + 2, p + sides + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

function rosetteGeometry() {
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20; points.push(new THREE.Vector2(.125 * Math.pow(Math.sin(Math.PI * t), .65) * (1 - t * .5), t * .27));
  }
  const g = new THREE.LatheGeometry(points, 24), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i));
    const ridge = 1 + .16 * Math.cos(a * 6 + y * 18);
    p.setXYZ(i, p.getX(i) * ridge + Math.pow(y / .27, 3) * .035, y, p.getZ(i) * ridge);
  }
  g.computeVertexNormals(); return g;
}

function buildCake() {
  cake = new THREE.Group(); scene.add(cake);
  const frosting = new THREE.MeshStandardMaterial({ color: '#fff2e4', roughness: .38 });
  const plateMaterial = new THREE.MeshStandardMaterial({ color: '#bcb0d0', roughness: .24, metalness: .22 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#e6cad5', roughness: .24, metalness: .55 });
  materials.sponge = new THREE.MeshStandardMaterial({ map: cakeTexture(palette.chocolate.sponge), roughness: .91 });
  materials.filling = new THREE.MeshStandardMaterial({ color: palette.chocolate.filling, roughness: .55 });
  materials.edge = new THREE.MeshStandardMaterial({ color: palette.chocolate.edge, roughness: .86 });
  const plate = new THREE.Group(); cake.add(plate);
  mesh(new THREE.CylinderGeometry(2.66, 2.54, .12, 96), plateMaterial, plate, 0, .16);
  mesh(new THREE.CylinderGeometry(2.37, 2.18, .075, 96), plateMaterial, plate, 0, .08);
  const rim = mesh(new THREE.TorusGeometry(2.61, .028, 10, 120), rimMaterial, plate, 0, .215); rim.rotation.x = Math.PI / 2;
  const bottom = new THREE.Group(); cake.add(bottom); segments.push({ group: bottom });
  mesh(new THREE.CylinderGeometry(2.06, 2.08, .52, 96), materials.sponge, bottom, 0, .53);
  mesh(new THREE.CylinderGeometry(2.075, 2.075, .04, 96), materials.edge, bottom, 0, .29);
  const firstCream = new THREE.Group(); cake.add(firstCream); segments.push({ group: firstCream });
  mesh(new THREE.CylinderGeometry(2.085, 2.075, .125, 96), materials.filling, firstCream, 0, .84);
  const middle = new THREE.Group(); cake.add(middle); segments.push({ group: middle });
  mesh(new THREE.CylinderGeometry(2.06, 2.06, .50, 96), materials.sponge, middle, 0, 1.14);
  const secondCream = new THREE.Group(); cake.add(secondCream); segments.push({ group: secondCream });
  mesh(new THREE.CylinderGeometry(2.085, 2.075, .115, 96), materials.filling, secondCream, 0, 1.445);
  const top = new THREE.Group(); cake.add(top); segments.push({ group: top });
  mesh(new THREE.CylinderGeometry(2.055, 2.06, .38, 96), materials.sponge, top, 0, 1.69);
  const icing = new THREE.Group(); cake.add(icing); segments.push({ group: icing });
  mesh(new THREE.CylinderGeometry(2.075, 2.075, .085, 96), frosting, icing, 0, 1.905);
  mesh(icingGeometry(2.06, 1.935), frosting, icing);
  const rosette = rosetteGeometry();
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const cream = mesh(rosette, frosting, icing, Math.cos(a) * 1.83, 1.93, Math.sin(a) * 1.83); cream.rotation.y = a;
  }
  // Baked-in geometry and instancing keep the cake detailed without a model download.
  const colors = ['#e8a3c4', '#bd9dd9', '#e5bd73', '#faf0de'];
  const sprinkleGeometry = new THREE.CapsuleGeometry(.022, .10, 3, 5);
  colors.forEach((color, c) => {
    const sprinkles = new THREE.InstancedMesh(sprinkleGeometry, new THREE.MeshStandardMaterial({ color, roughness: .55 }), 36);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      const a = i * 2.39996 + c * .5, r = .52 + Math.sqrt((i + .5) / 36) * 1.08;
      dummy.position.set(Math.cos(a) * r, 1.96, Math.sin(a) * r); dummy.rotation.set(Math.PI / 2, 0, a * 3); dummy.updateMatrix(); sprinkles.setMatrixAt(i, dummy.matrix);
    }
    sprinkles.castShadow = true; icing.add(sprinkles);
  });
  candle = new THREE.Group(); cake.add(candle); segments.push({ group: candle });
  const stripeCanvas = document.createElement('canvas'); stripeCanvas.width = stripeCanvas.height = 256;
  const ctx = stripeCanvas.getContext('2d'); ctx.fillStyle = '#fff4e7'; ctx.fillRect(0, 0, 256, 256); ctx.fillStyle = '#e886ae';
  for (let i = -512; i < 512; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 31, 0); ctx.lineTo(i + 287, 256); ctx.lineTo(i + 256, 256); ctx.fill(); }
  const stripe = new THREE.CanvasTexture(stripeCanvas); stripe.colorSpace = THREE.SRGBColorSpace; stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping; stripe.repeat.set(1, 2);
  mesh(new THREE.CylinderGeometry(.135, .135, 1.45, 40), new THREE.MeshStandardMaterial({ map: stripe, roughness: .38 }), candle, 0, 2.67);
  mesh(new THREE.CylinderGeometry(.133, .133, .018, 40), frosting, candle, 0, 3.405);
  mesh(new THREE.CylinderGeometry(.013, .018, .11, 8), new THREE.MeshStandardMaterial({ color: '#332329' }), candle, 0, 3.46);
  flame = mesh(new THREE.SphereGeometry(.115, 20, 24), new THREE.MeshBasicMaterial({ color: '#ffac3c', transparent: true, opacity: .9 }), candle, 0, 3.65);
  flame.geometry.translate(0, .02, 0); flame.scale.set(.75, 1.9, .75); flame.visible = false; flame.castShadow = false;
  flameCore = mesh(new THREE.SphereGeometry(.07, 12, 16), new THREE.MeshBasicMaterial({ color: '#fff5c9' }), flame, 0, -.018, .018); flameCore.scale.set(.8, .8, .8);
  glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  glow.position.set(0, 3.67, 0); glow.scale.set(1.8, 1.8, 1); candle.add(glow);
  candleLight = new THREE.PointLight('#ffc07b', 0, 7, 2); candleLight.position.set(0, 3.8, 0); candle.add(candleLight);
  const smokeMaterial = new THREE.SpriteMaterial({ map: glowTexture(), color: '#c9c1d8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.NormalBlending });
  for (let i = 0; i < 9; i++) { const puff = new THREE.Sprite(smokeMaterial.clone()); candle.add(puff); smokePuffs.push(puff); }
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 256;
  const shadowCtx = shadowCanvas.getContext('2d'), gradient = shadowCtx.createRadialGradient(128, 128, 15, 128, 128, 128);
  gradient.addColorStop(0, '#08050bd0'); gradient.addColorStop(.5, '#08050b70'); gradient.addColorStop(1, '#08050b00'); shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 7.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.03; scene.add(shadow);
  segments.forEach((segment, i) => {
    Object.assign(segment, DROP_SEQUENCE[i], { impacted: false });
    const original = segment.group, pivot = new THREE.Group();
    // Keep the original candle/smoke coordinates while giving each falling piece its own center.
    cake.remove(original); original.position.y = -segment.center; pivot.position.y = segment.center;
    pivot.add(original); cake.add(pivot); segment.group = pivot;
  });
}

function buildAtmosphere() {
  const positions = new Float32Array(100 * 3);
  for (let i = 0; i < 100; i++) { positions[i * 3] = (Math.random() - .5) * 17; positions[i * 3 + 1] = Math.random() * 10 - 2; positions[i * 3 + 2] = -3 - Math.random() * 5; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#efd0e6', size: .025, transparent: true, opacity: .5, sizeAttenuation: true, depthWrite: false })); scene.add(stars); crumbs.push(stars);
  const confettiGeometry = new THREE.PlaneGeometry(.055, .13);
  const colors = ['#efb2cd', '#b7a5dc', '#f6d394', '#f6ead6', '#d58fad'];
  for (let i = 0; i < (reduceMotion.matches ? 35 : 150); i++) {
    const particle = new THREE.Mesh(confettiGeometry, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide })); particle.visible = false; scene.add(particle);
    confetti.push({ mesh: particle, velocity: new THREE.Vector3(), spin: new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5), life: 0 });
  }
}

function launchConfetti() {
  confetti.forEach((p) => {
    p.mesh.position.set((Math.random() - .5) * 2, 2.5 + Math.random(), (Math.random() - .5) * 2);
    p.velocity.set((Math.random() - .5) * 5, 3 + Math.random() * 3, (Math.random() - .5) * 4);
    p.mesh.visible = true; p.life = 5 + Math.random() * 2;
  });
}

function buildEntranceEffects() {
  skyLight = new THREE.PointLight('#d9b0ff', 0, 18, 2); skyLight.position.set(0, 6, 2); scene.add(skyLight);
  const ringGeometry = new THREE.RingGeometry(.96, 1, 96);
  segments.forEach(() => {
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#efd0ff', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; cake.add(ring); impactRings.push({ mesh: ring, born: -100, mass: 1 });
  });
  dustPositions = new Float32Array(210 * 3); dustColors = new Float32Array(210 * 3);
  for (let i = 0; i < 210; i++) { dustPositions[i * 3 + 1] = -100; dustParticles.push({ velocity: new THREE.Vector3(), born: -100, life: 1, active: false }); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3).setUsage(THREE.DynamicDrawUsage));
  dust = new THREE.Points(geometry, new THREE.PointsMaterial({ size: .095, map: glowTexture(), vertexColors: true, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);
  const trails = new Float32Array(28 * 6);
  for (let i = 0; i < 28; i++) { const a = i * 2.399; const r = 2.8 + (i % 5) * .25; trails[i * 6] = trails[i * 6 + 3] = Math.cos(a) * r; trails[i * 6 + 2] = trails[i * 6 + 5] = Math.sin(a) * r; }
  const trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trails, 3).setUsage(THREE.DynamicDrawUsage));
  skyTrails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ color: '#d6b5f9', transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending }));
  skyTrails.frustumCulled = false; scene.add(skyTrails);
}

function landingSound(mass) {
  if (!audioEnabled || !audioContext) return;
  const t = audioContext.currentTime, osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(45, t + .25);
  gain.gain.setValueAtTime(.045 * mass, t); gain.gain.exponentialRampToValueAtTime(.001, t + .4);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t + .42);
}

function impact(segment, index) {
  const ring = impactRings[index]; ring.born = effectTime; ring.mass = segment.mass;
  ring.mesh.position.y = segment.center + segment.height / 2 + .03;
  landingSound(segment.mass);
  const count = Math.round(16 + segment.mass * 20);
  for (let i = 0; i < count; i++) {
    const id = dustCursor++ % dustParticles.length, p = dustParticles[id], a = i / count * Math.PI * 2 + Math.random() * .2;
    const radius = segment.name === 'candle' ? .2 : 1.9;
    dustPositions[id * 3] = Math.cos(a) * radius; dustPositions[id * 3 + 1] = segment.center - segment.height / 2 + .08; dustPositions[id * 3 + 2] = Math.sin(a) * radius;
    const speed = 1 + Math.random() * 1.8;
    p.velocity.set(Math.cos(a) * speed, .8 + Math.random() * 1.4, Math.sin(a) * speed);
    p.born = effectTime; p.life = .65 + Math.random() * .6; p.active = true;
  }
}

function clearEntranceEffects() {
  impactRings.forEach(ring => { ring.mesh.visible = false; ring.born = -100; });
  dustParticles.forEach((p, i) => { p.active = false; dustPositions[i * 3 + 1] = -100; });
  dust.geometry.attributes.position.needsUpdate = true;
  document.querySelector('.cake-scene').style.setProperty('--impact', '0');
}

function finishEntrance() {
  assembling = false; assemblyTime = ENTRANCE_DURATION;
  segments.forEach(s => { s.impacted = true; s.group.visible = true; s.group.position.set(0, s.center, 0); s.group.rotation.set(0, 0, 0); s.group.scale.set(1, 1, 1); });
  document.body.classList.remove('is-assembling'); $('skip-intro').hidden = true; $('wish').disabled = false;
  $('interaction-hint').hidden = false;
  $('cake-description').textContent = palette[config.flavour].label; updateState(0);
  camera.position.set(6.5, 5.6, 9); camera.fov = 34; camera.updateProjectionMatrix(); controls.target.set(0, 1.75, 0);
  controls.enabled = true; controls.autoRotate = !motionPaused; controls.update();
  skyLight.intensity = 0; keyLight.intensity = 4.2; skyTrails.visible = false;
}

function beginEntrance() {
  assemblyTime = 0; effectTime = 0; litAt = blownAt = -100; stage = 0;
  clearEntranceEffects(); confetti.forEach(p => p.mesh.visible = false);
  // Drain any orbit inertia before the cinematic camera takes over.
  controls.autoRotate = false; controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  cake.position.y = 0; segments.forEach(s => { s.impacted = false; s.group.visible = false; s.group.scale.set(1, 1, 1); });
  updateState(0);
  if (reduceMotion.matches) { finishEntrance(); return; }
  assembling = true; controls.enabled = false; $('wish').disabled = true; $('wish-label').textContent = 'Watch the magic';
  $('interaction-hint').hidden = true;
  $('cake-description').textContent = 'LOOK UP. SOMETHING SWEET IS ON ITS WAY.'; $('skip-intro').hidden = false;
  document.body.classList.add('is-assembling'); skyTrails.visible = true;
  camera.position.set(8.4, 7.2, 12.3); camera.fov = 38; controls.target.set(0, 2.7, 0); camera.lookAt(controls.target); camera.updateProjectionMatrix();
}

function animateEntrance(dt) {
  if (!assembling) return;
  if (!motionPaused) assemblyTime = Math.min(ENTRANCE_DURATION, assemblyTime + dt);
  let cameraShake = 0;
  segments.forEach((segment, i) => {
    const state = sampleDrop(segment, assemblyTime), g = segment.group;
    g.visible = state.visible;
    g.position.set(state.drift * Math.sign(segment.tilt), segment.center + state.offset + segment.height * (state.scaleY - 1) / 2, 0);
    g.rotation.set(state.tilt, state.twist, state.tilt * -.65);
    const width = 1 / Math.sqrt(state.scaleY); g.scale.set(width, state.scaleY, width);
    if (takeImpact(segment, assemblyTime)) impact(segment, i);
    const since = assemblyTime - segment.delay - segment.duration;
    if (since >= 0 && since < .6) cameraShake += Math.sin(since * 48) * Math.exp(-since * 13) * .055 * segment.mass;
  });
  const push = smooth((assemblyTime - 3) / (ENTRANCE_DURATION - 3));
  const arc = Math.sin(assemblyTime / ENTRANCE_DURATION * Math.PI) * .6;
  camera.position.set(THREE.MathUtils.lerp(8.4, 6.5, push) + arc + cameraShake, THREE.MathUtils.lerp(7.2, 5.6, push) + cameraShake * .6, THREE.MathUtils.lerp(12.3, 9, push) - arc * .5);
  controls.target.set(0, THREE.MathUtils.lerp(2.7, 1.75, push), 0); camera.lookAt(controls.target);
  camera.fov = THREE.MathUtils.lerp(38, 34, push); camera.updateProjectionMatrix();
  if (assemblyTime >= ENTRANCE_DURATION) finishEntrance();
}

function updateEntranceEffects(dt) {
  let flash = 0;
  impactRings.forEach(ring => {
    const age = effectTime - ring.born, active = age >= 0 && age < .65;
    ring.mesh.visible = active;
    if (!active) return;
    ring.mesh.scale.setScalar(2 + age * 5); ring.mesh.material.opacity = Math.pow(1 - age / .65, 2) * .28;
    flash = Math.max(flash, Math.exp(-age * 9) * ring.mass * .45);
  });
  dustParticles.forEach((p, i) => {
    if (!p.active) return;
    const age = effectTime - p.born, fade = Math.max(0, 1 - age / p.life);
    if (age >= p.life) { p.active = false; dustPositions[i * 3 + 1] = -100; return; }
    p.velocity.y -= dt * 2.3;
    dustPositions[i * 3] += p.velocity.x * dt; dustPositions[i * 3 + 1] += p.velocity.y * dt; dustPositions[i * 3 + 2] += p.velocity.z * dt;
    dustColors[i * 3] = fade; dustColors[i * 3 + 1] = fade * .72; dustColors[i * 3 + 2] = fade * .8;
  });
  dust.geometry.attributes.position.needsUpdate = true; dust.geometry.attributes.color.needsUpdate = true;
  document.querySelector('.cake-scene').style.setProperty('--impact', flash.toFixed(3));
  if (assembling) {
    skyLight.intensity = 5 + flash * 14; keyLight.intensity = 3.2 + smooth(assemblyTime / ENTRANCE_DURATION) + flash;
    const positions = skyTrails.geometry.attributes.position;
    for (let i = 0; i < 28; i++) { const y = 8 - ((assemblyTime * (1.1 + i % 3 * .3) + i * .51) % 8); positions.setY(i * 2, y); positions.setY(i * 2 + 1, y - .12 - (i % 4) * .07); }
    positions.needsUpdate = true; skyTrails.material.opacity = .16 * (1 - smooth((assemblyTime - 6.8) / 1.3));
  }
}

function updateState(next) {
  stage = next;
  ['step-one', 'step-two', 'step-three'].forEach((id, i) => {
    $(id).className = i === stage ? 'active' : i < stage ? 'done' : '';
    if (i === stage) $(id).setAttribute('aria-current', 'step'); else $(id).removeAttribute('aria-current');
  });
  const labels = ['Light the candle', 'Make a wish', 'Celebrate again'];
  const hints = ['', 'Close your eyes. Then tap to blow it out.', 'One more burst of birthday magic?'];
  $('wish-label').textContent = labels[stage]; $('action-hint').textContent = hints[stage];
  $('action-hint').hidden = !hints[stage];
  $('celebration-note').hidden = stage !== 2;
}

function setFlavour(flavour) {
  const next = palette[flavour];
  if (!next || !materials.sponge) return;
  materials.sponge.map?.dispose(); materials.sponge.map = cakeTexture(next.sponge); materials.sponge.needsUpdate = true;
  materials.edge.color.set(next.edge); materials.filling.color.set(next.filling); if (!assembling) $('cake-description').textContent = next.label;
  renderer.domElement.setAttribute('aria-label', `A three dimensional ${flavour} birthday cake with white drip icing and a pink striped candle. Drag to rotate, or use the left and right arrow keys.`);
}

function applyConfig() {
  $('recipient').textContent = config.name ? `This one's for you, ${config.name}.` : ''; $('recipient').hidden = !config.name;
  $('message').textContent = config.message || defaults; $('name').value = config.name; $('personal-message').value = config.message;
  document.querySelector(`input[name="flavour"][value="${config.flavour}"]`).checked = true;
  document.title = config.name ? `Happy Birthday, ${config.name}!` : 'A Little Birthday Magic';
  setFlavour(config.flavour);
}

function updateMotionUI() {
  $('motion').setAttribute('aria-pressed', String(motionPaused)); $('motion-label').textContent = motionPaused ? 'Resume motion' : 'Pause motion';
  $('motion-icon').textContent = motionPaused ? '▷' : 'Ⅱ';
  if (controls) controls.autoRotate = !motionPaused && !assembling;
  document.body.classList.toggle('is-motion-paused', motionPaused);
  document.querySelectorAll('.orbit-star').forEach(el => el.style.animationPlayState = motionPaused ? 'paused' : 'running');
}

function animate() {
  const frameDelta = clock.getDelta();
  if (document.hidden) return;
  const dt = Math.min(frameDelta, .05); elapsed += Math.min(frameDelta, .25);
  const motionDelta = motionPaused ? 0 : Math.min(frameDelta, .1);
  effectTime += motionDelta; animateEntrance(Math.min(frameDelta, .1)); updateEntranceEffects(motionDelta);
  if (!motionPaused) cake.position.y = assembling ? 0 : Math.sin(elapsed * .7) * .045;
  const lightAmount = stage === 1 ? easeOut((elapsed - litAt) / .7) : 1 - smooth((elapsed - blownAt) / .35);
  flame.visible = lightAmount > .005;
  if (flame.visible) {
    const flicker = motionPaused ? 1 : 1 + Math.sin(elapsed * 17) * .055 + Math.cos(elapsed * 23) * .035;
    flame.scale.set(.75 * lightAmount, 1.9 * flicker * lightAmount, .75 * lightAmount);
    flame.rotation.z = motionPaused ? 0 : Math.sin(elapsed * 10) * .045;
    glow.material.opacity = lightAmount * .54 * flicker;
    candleLight.intensity = lightAmount * 3.7 * flicker;
  } else { glow.material.opacity = 0; candleLight.intensity = 0; }
  const smokeTime = elapsed - blownAt;
  smokePuffs.forEach((puff, i) => {
    const t = smokeTime - i * .09;
    puff.visible = stage === 2 && t > 0 && t < 2.1;
    if (puff.visible) { puff.position.set(Math.sin(t * 3 + i * .2) * t * .12, 3.55 + t * .8, 0); puff.scale.setScalar(.12 + t * .2); puff.material.opacity = Math.sin(t / 2.1 * Math.PI) * .08; }
  });
  confetti.forEach(p => {
    if (!p.mesh.visible) return; p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; return; }
    p.velocity.y -= dt * 1.8; p.mesh.position.addScaledVector(p.velocity, dt);
    p.mesh.position.x += Math.sin(elapsed * 3 + p.spin.x) * dt * .2;
    p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
    if (p.mesh.position.y < -1.5) p.mesh.visible = false;
  });
  if (!motionPaused) crumbs.forEach(stars => { stars.rotation.y += dt * .007; });
  if (!assembling) controls.update(dt); renderer.render(scene, camera);
}

async function init() {
  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 1, .1, 100); camera.position.set(6.5, 5.6, 9);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A three dimensional chocolate birthday cake with white drip icing and a pink striped candle. Drag to rotate, or use the left and right arrow keys.'); $('scene').append(canvas);
    controls = new OrbitControls(camera, canvas); controls.target.set(0, 1.75, 0); controls.enableDamping = true; controls.dampingFactor = .045;
    controls.enablePan = false; controls.enableZoom = false; controls.autoRotate = !motionPaused; controls.autoRotateSpeed = .45;
    controls.minPolarAngle = .65; controls.maxPolarAngle = 1.45; controls.update();
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('keydown', (event) => {
      if (assembling || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -.18 : .18); camera.position.copy(controls.target).add(offset); controls.update();
    });
    scene.add(new THREE.HemisphereLight('#eedbf9', '#6b3c66', 2.7));
    const key = new THREE.DirectionalLight('#ffe9d2', 4.2); keyLight = key; key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -5; key.shadow.camera.right = key.shadow.camera.top = 5; key.shadow.normalBias = .035; scene.add(key);
    const rim = new THREE.DirectionalLight('#d4a4ed', 3.5); rim.position.set(4, 4, -4); scene.add(rim);
    const fill = new THREE.DirectionalLight('#f2bbd0', 1); fill.position.set(4, 2, 6); scene.add(fill);
    buildCake(); buildAtmosphere(); buildEntranceEffects(); applyConfig(); updateMotionUI();
    const resize = () => { const { width, height } = $('scene').getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); };
    new ResizeObserver(resize).observe($('scene')); resize();
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); $('loading').hidden = false; $('loading').classList.add('error'); $('loading').textContent = 'The 3D view was interrupted. Reload the page to bring your cake back.'; $('wish').disabled = true; renderer.setAnimationLoop(null); });
    await renderer.compileAsync(scene, camera);
    $('loading').hidden = true; beginEntrance();
    clock.start(); renderer.setAnimationLoop(animate);
  } catch (error) {
    console.error('Cake could not initialize:', error);
    $('loading').classList.add('error'); $('loading').replaceChildren();
    const message = document.createElement('p'); message.textContent = 'Your cake needs a browser with WebGL 2 enabled. Try a recent Chrome, Edge, Safari, or Firefox.';
    const retry = document.createElement('a'); retry.href = location.href; retry.textContent = 'Try again'; $('loading').append(message, retry);
    $('wish-label').textContent = '3D view unavailable';
  }
}

$('wish').addEventListener('click', () => {
  if (assembling) return;
  if (stage === 0) { litAt = elapsed; updateState(1); chime(); }
  else if (stage === 1) { blownAt = elapsed; updateState(2); launchConfetti(); chime(true); }
  else { launchConfetti(); chime(true); }
});
$('replay').addEventListener('click', () => {
  if (!cake || !dust) return; beginEntrance();
});
$('skip-intro').addEventListener('click', () => { clearEntranceEffects(); finishEntrance(); });
$('motion').addEventListener('click', () => { motionPaused = !motionPaused; updateMotionUI(); });
reduceMotion.addEventListener('change', (event) => { motionPaused = event.matches; if (event.matches && assembling) { clearEntranceEffects(); finishEntrance(); } updateMotionUI(); });
$('sound').addEventListener('click', () => {
  audioEnabled = !audioEnabled; $('sound').setAttribute('aria-pressed', String(audioEnabled)); $('sound').setAttribute('aria-label', audioEnabled ? 'Turn sound off' : 'Turn sound on');
  if (audioEnabled) chime(); notify(audioEnabled ? 'A little sound is on.' : 'Sound is off.');
});
const dialog = $('personalize-dialog');
$('customize').addEventListener('click', () => dialog.showModal());
document.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('personalize-form').addEventListener('submit', (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  config.name = String(data.get('name')).trim().slice(0, 28); config.message = String(data.get('message')).trim().slice(0, 140);
  config.flavour = Object.hasOwn(palette, data.get('flavour')) ? data.get('flavour') : 'chocolate'; applyConfig();
  const url = new URL(location.href); ['name', 'message', 'flavour'].forEach(key => { if (config[key]) url.searchParams.set(key, config[key]); else url.searchParams.delete(key); });
  history.replaceState(null, '', url); dialog.close(); notify('Your finishing touches are ready.');
});
const params = new URLSearchParams(location.search);
config.name = (params.get('name') || '').slice(0, 28); config.message = (params.get('message') || '').slice(0, 140);
if (Object.hasOwn(palette, params.get('flavour'))) config.flavour = params.get('flavour');
init();
