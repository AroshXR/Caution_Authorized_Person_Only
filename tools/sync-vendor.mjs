import { mkdir, copyFile } from 'node:fs/promises';
const destination = new URL('../dist/vendor/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const [source, target] of [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
  ['LICENSE', 'LICENSE']
]) await copyFile(new URL('../node_modules/three/' + source, import.meta.url), new URL(target, destination));
console.log('Three.js browser files are ready.');
