import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBots } from './bots.js';
import { Dancer } from './dance.js';
import { AudioEngine } from './audio.js';
import { initUI } from './ui.js';

// ---------- renderer / scene ----------
// phones/tablets get a lighter render so the dancing stays smooth
const touch = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: !touch });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070c);
// soft studio reflections so the metal parts (esp. Grok's chrome) actually read
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.Fog(0x07070c, 9, 22);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.3, 7.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.05, 0);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x8899ff, 0x110a08, 0.35));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 7, 5);
key.castShadow = true;
key.shadow.mapSize.setScalar(touch ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -3 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb4ff, 1.2);
rim.position.set(-4, 4, -5);
scene.add(rim);

// ---------- dance floor: glowing tiles that react to the music ----------
const COLS = 14, ROWS = 8, TILE = 0.62;
const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.04, TILE * 0.94);
const tileMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const tiles = new THREE.InstancedMesh(tileGeo, tileMat, COLS * ROWS);
const tileInfo = [];
const m4 = new THREE.Matrix4();
for (let r = 0, i = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, i++) {
  const x = (c - (COLS - 1) / 2) * TILE, z = (r - (ROWS - 1) / 2) * TILE - 0.6;
  m4.makeTranslation(x, -0.02, z);
  tiles.setMatrixAt(i, m4);
  tileInfo.push({ x, z, d: Math.hypot(x, z), seed: Math.random() });
  tiles.setColorAt(i, new THREE.Color(0x111118));
}
scene.add(tiles);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.55 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0.002;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.045;
scene.add(ground);

// ---------- bots ----------
const bots = createBots();
let spacing = 2.5; // shrinks on portrait screens, see layout()
for (const b of bots) b.root.traverse((o) => { if (o.material?.isMeshStandardMaterial) o.material.envMapIntensity = 0.35; });
const dancers = bots.map((bot, i) => {
  bot.root.position.x = (i - 1) * spacing;
  scene.add(bot.root);

  // colored spotlight per bot
  const spot = new THREE.SpotLight(bot.color, 0, 12, 0.42, 0.6, 0);
  spot.position.set(bot.root.position.x, 6, 1.5);
  spot.target = bot.root;
  scene.add(spot);
  bot.spot = spot;

  // name plate on the floor
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = '800 72px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#' + bot.color.toString(16).padStart(6, '0');
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 20;
  ctx.fillText(bot.name, 256, 92);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(bot.root.position.x, 0.01, 1.05);
  scene.add(plate);
  bot.plate = plate;

  return new Dancer(bot, i);
});

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomScale = touch ? 0.5 : 1;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * bloomScale, innerHeight * bloomScale), 0.6, 0.5, 0.75);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- responsive layout ----------
// Portrait screens: bots huddle closer (side bots step back a little) and the camera
// backs off just enough to fit all three. On phones the control panel sits at the
// bottom, so the picture is nudged up to keep the bots clear of it.
const panel = document.getElementById('panel');
const CAM_DIR = new THREE.Vector3(0, 1.25, 7.6).normalize();

function layout() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  const portrait = aspect < 0.85;
  spacing = portrait ? 1.75 : 2.5;
  bots.forEach((b, i) => {
    const x = (i - 1) * spacing, z = portrait && i !== 1 ? -0.5 : 0;
    b.root.position.set(x, 0, z);
    b.plate.position.set(x, 0.01, z + 1.05);
    b.plate.scale.setScalar(portrait ? 0.8 : 1);
    b.spot.position.set(x, 6, z + 1.5);
  });

  camera.fov = portrait ? 50 : 42;
  camera.aspect = aspect;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitWidth = spacing * 2 + 1.7;                 // all bots + arm room
  const dist = Math.max(7.8, fitWidth / 2 / (halfH * aspect));
  controls.target.set(0, 1.05, 0);
  camera.position.copy(CAM_DIR).multiplyScalar(dist).add(controls.target);
  controls.maxDistance = Math.max(14, dist * 1.6);
  scene.fog.near = dist + 1.5;
  scene.fog.far = dist + 14;

  applyViewShift();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w * bloomScale, h * bloomScale);
}
// shift the view up by part of the panel's height when it covers the bottom of the screen
function applyViewShift() {
  const w = innerWidth, h = innerHeight;
  const shift = w <= 640 ? Math.min(panel.offsetHeight, h * 0.5) * 0.5 : 0;
  if (shift) camera.setViewOffset(w, h, 0, shift, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);
// the panel grows when tracks are added or the beats menu opens
new ResizeObserver(applyViewShift).observe(panel);

// ---------- audio + UI ----------
const engine = new AudioEngine();
const ui = initUI(engine);
window.__beats = { engine, bots, dancers, camera, controls };
layout(); // handy for debugging in devtools

// ---------- loop ----------
const clock = new THREE.Clock();
const col = new THREE.Color();
const palette = bots.map((b) => new THREE.Color(b.color));

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  engine.update(dt);

  const s = {
    t, dt,
    playing: engine.playing,
    phase: engine.phase,
    beat: engine.beat,
    pulse: engine.pulse,
    bass: engine.bass, mid: engine.mid, high: engine.high,
    energy: engine.energy,
    bands: engine.bands,
  };
  for (const d of dancers) d.update(dt, s);

  // lights + floor follow the beat
  for (const b of bots) b.spot.intensity = s.playing ? 4 + s.pulse * 10 + s.bass * 6 : 1.2;
  bloom.strength = 0.5 + s.pulse * 0.5;
  const ring = (s.beat % 8) + s.phase;
  for (let i = 0; i < tileInfo.length; i++) {
    const ti = tileInfo[i];
    if (s.playing) {
      // a ripple travelling outward each beat + bass shimmer
      const wave = Math.max(0, 1 - Math.abs(ti.d - s.phase * 5) * 1.4);
      const which = Math.floor((ti.x / spacing + 1.5));
      col.copy(palette[Math.max(0, Math.min(2, which))]);
      const lvl = 0.05 + wave * 0.55 * (0.4 + s.pulse) + (ti.seed < s.bass * 0.4 ? 0.25 : 0)
        + ((Math.floor(ring) + Math.floor(ti.x / TILE) + Math.floor(ti.z / TILE)) % 2 === 0 ? s.pulse * 0.12 : 0);
      col.multiplyScalar(lvl);
    } else {
      const g = 0.035 + 0.02 * Math.sin(t * 0.8 + ti.d);
      col.setRGB(g, g, g * 1.4);
    }
    tiles.setColorAt(i, col);
  }
  tiles.instanceColor.needsUpdate = true;

  ui.tick(s);
  controls.update();
  composer.render();
  requestAnimationFrame(frame);
}
frame();
