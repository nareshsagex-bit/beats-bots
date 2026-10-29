// Procedural 3D bots: Codex, Claude, Grok.
// Every bot shares one joint rig (so the dance engine can drive any of them),
// but each gets its own body shapes, materials and animated face.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- helpers ----------
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, ...opts });
}
function glow(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });
}
function add(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(parent, pos = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}
function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

// ---------- brand emblems ----------
// Claude spark: irregular many-rayed starburst with rounded tips (2D shape, extruded to 3D).
function sparkShape(R) {
  const lens = [1, 0.8, 0.94, 0.76, 1, 0.84, 0.9, 0.78, 0.97, 0.82, 0.92, 0.77];
  const n = lens.length, s = new THREE.Shape();
  const pt = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2, r = R * lens[i], w = 0.1;
    const valley = pt(a - Math.PI / n, R * 0.3);
    i === 0 ? s.moveTo(...valley) : s.lineTo(...valley);
    s.lineTo(...pt(a - w, r * 0.9));
    s.quadraticCurveTo(...pt(a, r * 1.08), ...pt(a + w, r * 0.9));
  }
  s.closePath();
  return s;
}
function sparkGeometry(R, depth = 0.04) {
  const g = new THREE.ExtrudeGeometry(sparkShape(R), {
    depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: R * 0.03, bevelSegments: 2, curveSegments: 6,
  });
  g.center();
  return g;
}

// Codex / OpenAI-style knot: six interlocking rounded links (canvas decal).
function drawKnot(ctx, cx, cy, R, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.lineWidth = R * 0.15;
  ctx.lineJoin = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    const w = R * 0.52, h = R * 0.95, x = -R * 0.08, y = -R * 0.98, rr = w * 0.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    ctx.stroke();
  }
  ctx.restore();
}

// Grok mark: a ring broken where a diagonal slash cuts through it (3D, glowing).
function grokMark(material, R = 0.15, tube = 0.024) {
  const g = new THREE.Group();
  const gap = THREE.MathUtils.degToRad(24);
  for (const start of [Math.PI / 4, Math.PI * 1.25]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 10, 48, Math.PI - gap * 2), material);
    arc.rotation.z = start + gap;
    g.add(arc);
  }
  const slash = new THREE.Mesh(new RoundedBoxGeometry(tube * 2, R * 3.1, tube * 2, 2, tube * 0.9), material);
  slash.rotation.z = -Math.PI / 4;
  g.add(slash);
  return g;
}

// ---------- shared rig ----------
// Dimensions (metres-ish). Bot stands ~1.9 tall with feet on y=0.
const R = {
  hipY: 0.95, hipX: 0.17, thigh: 0.45, shin: 0.42,
  spineY: 0.08, shoulderY: 0.52, shoulderX: 0.34, upper: 0.32, fore: 0.3,
  neckY: 0.64,
};

/** Builds the bare joint hierarchy. `parts` callbacks attach meshes. */
function buildRig(parts) {
  const root = new THREE.Group();
  const j = {};
  j.hips = joint(root, [0, R.hipY, 0]);
  j.spine = joint(j.hips, [0, R.spineY, 0]);
  j.neck = joint(j.spine, [0, R.neckY, 0]);
  j.head = joint(j.neck, [0, 0.06, 0]);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    j['shoulder' + side] = joint(j.spine, [s * R.shoulderX, R.shoulderY, 0]);
    j['elbow' + side] = joint(j['shoulder' + side], [0, -R.upper, 0]);
    j['hand' + side] = joint(j['elbow' + side], [0, -R.fore, 0]);
    j['thigh' + side] = joint(j.hips, [s * R.hipX, 0, 0]);
    j['knee' + side] = joint(j['thigh' + side], [0, -R.thigh, 0]);
    j['foot' + side] = joint(j['knee' + side], [0, -R.shin, 0]);
  }
  // remember rest positions so the dance can offset from them
  for (const k in j) j[k].userData.rest = j[k].position.clone();
  parts(j);
  return { root, j };
}

// ---------- CODEX: boxy terminal robot ----------
function buildCodex() {
  const body = mat(0x1d2027, { roughness: 0.35, metalness: 0.4 });
  const shell = mat(0xe9edf2, { roughness: 0.3 });
  const joints = mat(0x3a3f4a, { metalness: 0.6, roughness: 0.3 });
  const accent = glow(0x3cf0b4, 2.4);

  const face = canvasTexture(256, 192);
  const faceMat = new THREE.MeshBasicMaterial({ map: face.tex, toneMapped: false });

  const rig = buildRig((j) => {
    // torso: dark box
    add(j.spine, new RoundedBoxGeometry(0.62, 0.62, 0.38, 4, 0.06), body, [0, 0.32, 0]);
    // white chest plate carrying the knot emblem
    add(j.spine, new RoundedBoxGeometry(0.4, 0.4, 0.05, 3, 0.05), shell, [0, 0.36, 0.19]);
    const knot = canvasTexture(256, 256);
    drawKnot(knot.ctx, 128, 128, 92, '#111317');
    add(j.spine, new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ map: knot.tex, transparent: true }), [0, 0.36, 0.217]);
    add(j.spine, new THREE.BoxGeometry(0.06, 0.02, 0.02), accent, [0.2, 0.1, 0.2]);
    add(j.hips, new RoundedBoxGeometry(0.5, 0.16, 0.32, 3, 0.04), joints, [0, 0, 0]);
    // neck + monitor head
    add(j.neck, new THREE.CylinderGeometry(0.06, 0.08, 0.1, 12), joints, [0, 0, 0]);
    add(j.head, new RoundedBoxGeometry(0.66, 0.48, 0.42, 4, 0.07), shell, [0, 0.24, 0]);
    add(j.head, new RoundedBoxGeometry(0.56, 0.38, 0.05, 3, 0.04), body, [0, 0.24, 0.2]);
    add(j.head, new THREE.PlaneGeometry(0.5, 0.33), faceMat, [0, 0.24, 0.226]);
    // antenna
    add(j.head, new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), joints, [0.2, 0.56, 0]);
    j.antennaTip = add(j.head, new THREE.SphereGeometry(0.04, 16, 12), accent, [0.2, 0.67, 0]);
    // ear bolts
    for (const s of [1, -1]) add(j.head, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), joints, [s * 0.35, 0.24, 0], [0, 0, Math.PI / 2]);

    for (const side of ['L', 'R']) {
      add(j['shoulder' + side], new THREE.SphereGeometry(0.09, 16, 12), joints);
      add(j['shoulder' + side], new RoundedBoxGeometry(0.14, R.upper, 0.14, 3, 0.03), shell, [0, -R.upper / 2, 0]);
      add(j['elbow' + side], new THREE.SphereGeometry(0.07, 16, 12), joints);
      add(j['elbow' + side], new RoundedBoxGeometry(0.13, R.fore, 0.13, 3, 0.03), body, [0, -R.fore / 2, 0]);
      add(j['hand' + side], new RoundedBoxGeometry(0.12, 0.12, 0.1, 3, 0.03), joints, [0, -0.05, 0]);
      add(j['thigh' + side], new RoundedBoxGeometry(0.17, R.thigh, 0.17, 3, 0.04), body, [0, -R.thigh / 2, 0]);
      add(j['knee' + side], new THREE.SphereGeometry(0.085, 16, 12), joints);
      add(j['knee' + side], new RoundedBoxGeometry(0.16, R.shin, 0.16, 3, 0.04), shell, [0, -R.shin / 2, 0]);
      add(j['foot' + side], new RoundedBoxGeometry(0.2, 0.09, 0.3, 3, 0.03), body, [0, -0.04, 0.05]);
    }
  });

  let blink = 0;
  function drawFace(t, s) {
    const { ctx, canvas, tex } = face;
    ctx.fillStyle = '#05140f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // scanlines
    ctx.fillStyle = 'rgba(60,240,180,0.06)';
    for (let y = 0; y < canvas.height; y += 6) ctx.fillRect(0, y, canvas.width, 2);
    const g = `rgba(60,240,180,${0.75 + s.pulse * 0.25})`;
    ctx.fillStyle = g;
    ctx.font = 'bold 26px Consolas, monospace';
    ctx.fillText('> codex', 16, 34);
    // eyes: terminal block cursors, squash on blink and on beat
    blink = Math.max(0, blink - 0.08);
    if (Math.random() < 0.006) blink = 1;
    const eh = 52 * (1 - blink * 0.9) * (1 - s.pulse * 0.35);
    const ey = 105 - eh / 2;
    ctx.fillRect(62, ey, 38, eh);
    ctx.fillRect(156, ey, 38, eh);
    // mouth: little equalizer driven by audio
    const bars = 9;
    for (let i = 0; i < bars; i++) {
      const v = s.playing ? (s.bands[i % s.bands.length] || 0) : 0.08 + 0.04 * Math.sin(t * 2 + i);
      const h = 4 + v * 34;
      ctx.fillRect(74 + i * 12, 168 - h, 8, h);
    }
    tex.needsUpdate = true;
  }

  return {
    ...rig,
    name: 'CODEX',
    color: 0x3cf0b4,
    moves: ['robot', 'bounce', 'clap', 'sideStep', 'pump'],
    update(t, s) {
      drawFace(t, s);
      rig.j.antennaTip.material.emissiveIntensity = 1.5 + s.pulse * 4;
    },
  };
}

// ---------- CLAUDE: soft round bot with a sparkle crown ----------
function buildClaude() {
  const clay = mat(0xd97757, { roughness: 0.55 });
  const cream = mat(0xf3ebe0, { roughness: 0.6 });
  const spark = mat(0xd97757, { emissive: 0xd97757, emissiveIntensity: 0.9, roughness: 0.35 });
  const sparkFlat = mat(0xd97757, { roughness: 0.4, emissive: 0xd97757, emissiveIntensity: 0.25 });

  const face = canvasTexture(256, 160);
  const faceMat = new THREE.MeshBasicMaterial({ map: face.tex, toneMapped: false });

  const rig = buildRig((j) => {
    // pear-shaped body
    // ivory body so the terracotta spark pops, like Claude's own colours
    add(j.spine, new THREE.SphereGeometry(0.36, 32, 24), cream, [0, 0.3, 0], [0, 0, 0], [1, 1.05, 0.82]);
    add(j.spine, new THREE.TorusGeometry(0.3, 0.035, 12, 40), clay, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 0.82, 1]);
    add(j.hips, new THREE.SphereGeometry(0.24, 24, 16), clay, [0, 0.02, 0], [0, 0, 0], [1.1, 0.6, 0.9]);
    // head: cream sphere + dark visor + face screen
    add(j.neck, new THREE.CylinderGeometry(0.07, 0.09, 0.1, 16), cream);
    add(j.head, new THREE.SphereGeometry(0.31, 32, 24), cream, [0, 0.27, 0]);
    // curved visor wrapping the front of the head; the face canvas is painted onto it
    add(j.head, new THREE.SphereGeometry(0.316, 40, 24, Math.PI * 0.14, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.42), faceMat, [0, 0.27, 0]);
    // the Claude spark, big and solid, floating above the head
    j.crown = joint(j.head, [0, 0.74, 0]);
    add(j.crown, sparkGeometry(0.2, 0.05), spark);
    add(j.head, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), cream, [0, 0.6, 0]);
    // and again as the chest emblem
    add(j.spine, sparkGeometry(0.14, 0.025), sparkFlat, [0, 0.34, 0.3]);
    // little cheek blush
    const blush = new THREE.MeshBasicMaterial({ color: 0xff8c6a, transparent: true, opacity: 0.55 });
    for (const s of [1, -1]) add(j.head, new THREE.CircleGeometry(0.035, 16), blush, [s * 0.2, 0.18, 0.245], [0, s * 0.6, 0]);

    for (const side of ['L', 'R']) {
      add(j['shoulder' + side], new THREE.SphereGeometry(0.09, 20, 16), clay);
      add(j['shoulder' + side], new THREE.CapsuleGeometry(0.07, R.upper - 0.1, 6, 16), clay, [0, -R.upper / 2, 0]);
      add(j['elbow' + side], new THREE.CapsuleGeometry(0.065, R.fore - 0.08, 6, 16), cream, [0, -R.fore / 2, 0]);
      add(j['hand' + side], new THREE.SphereGeometry(0.075, 20, 16), clay, [0, -0.04, 0]);
      add(j['thigh' + side], new THREE.CapsuleGeometry(0.085, R.thigh - 0.12, 6, 16), clay, [0, -R.thigh / 2, 0]);
      add(j['knee' + side], new THREE.CapsuleGeometry(0.075, R.shin - 0.1, 6, 16), cream, [0, -R.shin / 2, 0]);
      add(j['foot' + side], new THREE.SphereGeometry(0.11, 20, 16), clay, [0, -0.04, 0.05], [0, 0, 0], [1, 0.55, 1.4]);
    }
  });

  let blink = 0;
  function drawFace(t, s) {
    const { ctx, canvas, tex } = face;
    ctx.fillStyle = '#21160f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blink = Math.max(0, blink - 0.07);
    if (Math.random() < 0.005) blink = 1;
    ctx.fillStyle = '#ffb08a';
    ctx.shadowColor = '#ff8c5a';
    ctx.shadowBlur = 18;
    const happy = s.playing;
    for (const x of [78, 178]) {
      if (happy) {
        // ^ ^ happy arcs, bouncing with the beat
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffb08a';
        ctx.beginPath();
        ctx.arc(x, 82 + s.pulse * 6, 24, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x, 72, 17, 26 * (1 - blink * 0.9), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // smile
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#ffb08a';
    ctx.beginPath();
    const open = happy ? 0.25 + s.bass * 0.35 : 0.2;
    ctx.arc(128, 104, 22, Math.PI * (0.5 - open), Math.PI * (0.5 + open));
    ctx.stroke();
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
  }

  return {
    ...rig,
    name: 'CLAUDE',
    color: 0xff8c5a,
    moves: ['armWave', 'bounce', 'disco', 'sideStep', 'spin', 'clap'],
    update(t, s) {
      drawFace(t, s);
      rig.j.crown.rotation.z = t * 0.6 + s.pulse * 0.3;
      rig.j.crown.children[0].material.emissiveIntensity = 0.7 + s.pulse * 1.6;
      const k = 1 + s.pulse * 0.25;
      rig.j.crown.scale.set(k, k, k);
    },
  };
}

// ---------- GROK: angular chrome bot with a light-slash visor ----------
function buildGrok() {
  const chrome = mat(0x3a3d46, { roughness: 0.22, metalness: 0.85 });
  const plate = mat(0x5a5f6b, { roughness: 0.3, metalness: 0.8 });
  const white = mat(0xd8dbe2, { roughness: 0.3, metalness: 0.5 });
  const slash = glow(0xf2f6ff, 2.5);
  const gloss = mat(0x0b0b0d, { roughness: 0.12, metalness: 0.6 });
  const visorGlass = mat(0x000000, { roughness: 0.05, metalness: 0.9 });
  const edge = glow(0x6aa8ff, 1.6);

  const face = canvasTexture(256, 244);
  const faceMat = new THREE.MeshBasicMaterial({ map: face.tex, toneMapped: false, transparent: true });

  const rig = buildRig((j) => {
    // inverted-wedge torso (broad shoulders, narrow waist)
    add(j.spine, new THREE.CylinderGeometry(0.42, 0.22, 0.66, 4, 1), chrome, [0, 0.32, 0], [0, Math.PI / 4, 0], [1, 1, 0.62]);
    add(j.spine, new THREE.BoxGeometry(0.05, 0.5, 0.02), edge, [0, 0.33, 0.165], [0, 0, 0.5]);
    add(j.hips, new THREE.CylinderGeometry(0.2, 0.26, 0.18, 6), plate);
    // angular shoulder pads
    for (const s of [1, -1]) add(j.spine, new THREE.BoxGeometry(0.22, 0.08, 0.3), plate, [s * 0.34, 0.62, 0], [0, 0, -s * 0.35]);
    // head: glossy black app-icon cube with a glowing face screen
    add(j.neck, new THREE.CylinderGeometry(0.06, 0.08, 0.1, 6), plate);
    add(j.head, new RoundedBoxGeometry(0.56, 0.54, 0.5, 5, 0.11), gloss, [0, 0.28, 0]);
    add(j.head, new RoundedBoxGeometry(0.46, 0.44, 0.02, 4, 0.008), visorGlass, [0, 0.28, 0.25]);
    add(j.head, new THREE.PlaneGeometry(0.44, 0.42), faceMat, [0, 0.28, 0.262]);
    // the ring-and-slash mark hovers above the head, like Claude's spark
    j.mark = grokMark(slash, 0.13, 0.02);
    j.mark.position.set(0, 0.76, 0);
    j.head.add(j.mark);
    add(j.head, new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), plate, [0, 0.6, 0]);
    // ear fins
    for (const s of [1, -1]) add(j.head, new THREE.BoxGeometry(0.04, 0.22, 0.2), plate, [s * 0.3, 0.28, -0.02]);

    for (const side of ['L', 'R']) {
      add(j['shoulder' + side], new THREE.OctahedronGeometry(0.1, 0), plate);
      add(j['shoulder' + side], new THREE.CylinderGeometry(0.075, 0.06, R.upper, 6), chrome, [0, -R.upper / 2, 0]);
      add(j['elbow' + side], new THREE.OctahedronGeometry(0.075, 0), white);
      add(j['elbow' + side], new THREE.CylinderGeometry(0.07, 0.05, R.fore, 6), chrome, [0, -R.fore / 2, 0]);
      add(j['elbow' + side], new THREE.BoxGeometry(0.02, R.fore * 0.7, 0.02), edge, [0, -R.fore / 2, 0.065]);
      add(j['hand' + side], new THREE.OctahedronGeometry(0.075, 0), plate, [0, -0.05, 0]);
      add(j['thigh' + side], new THREE.CylinderGeometry(0.1, 0.07, R.thigh, 6), chrome, [0, -R.thigh / 2, 0]);
      add(j['knee' + side], new THREE.OctahedronGeometry(0.085, 0), white);
      add(j['knee' + side], new THREE.CylinderGeometry(0.08, 0.06, R.shin, 6), plate, [0, -R.shin / 2, 0]);
      add(j['foot' + side], new THREE.BoxGeometry(0.16, 0.08, 0.32), chrome, [0, -0.04, 0.06], [0.05, 0, 0]);
    }
  });

  let blink = 0;
  function drawFace(t, s) {
    const { ctx, canvas, tex } = face;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blink = Math.max(0, blink - 0.08);
    if (Math.random() < 0.005) blink = 1;
    ctx.fillStyle = '#eef4ff';
    ctx.shadowColor = '#8fbaff';
    ctx.shadowBlur = 16 + s.pulse * 14;

    // eyes: sharp, slightly narrowed lenses angled in = Grok's cheeky attitude
    const open = (1 - blink * 0.9) * (s.playing ? 1 - s.pulse * 0.25 : 1);
    for (const sg of [-1, 1]) {
      const cx = 128 + sg * 52, cy = 92, w = 34, h = 17 * open;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sg * -0.18);
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(0, -h * 2, w, 0);
      ctx.quadraticCurveTo(0, h * 1.2, -w, 0);
      ctx.fill();
      ctx.restore();
    }
    // brows: one cocked up
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#eef4ff';
    ctx.beginPath(); ctx.moveTo(56, 52); ctx.lineTo(104, 60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(152, 56); ctx.lineTo(200, 42 - s.pulse * 6); ctx.stroke();

    // lips: a lopsided smirk that opens into a grin with the bass
    const gape = s.playing ? 4 + s.bass * 22 : 3;
    const lx = 86, rx = 176, my = 172, lift = 10; // right corner lifted
    ctx.beginPath();
    ctx.moveTo(lx, my);
    ctx.quadraticCurveTo(128, my - 6 - gape * 0.3, rx, my - lift);       // upper lip
    ctx.quadraticCurveTo(132, my + 10 + gape, lx, my);                    // lower lip
    ctx.fill();
    if (gape > 8) {
      // dark mouth opening between the lips
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0d14';
      ctx.beginPath();
      ctx.moveTo(lx + 10, my);
      ctx.quadraticCurveTo(128, my - 2, rx - 10, my - lift + 2);
      ctx.quadraticCurveTo(130, my + gape * 0.85, lx + 10, my);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
  }

  return {
    ...rig,
    name: 'GROK',
    color: 0x6aa8ff,
    moves: ['headbang', 'robot', 'disco', 'spin', 'pump'],
    update(t, s) {
      drawFace(t, s);
      rig.j.mark.children[0].material.emissiveIntensity = 1.8 + s.pulse * 4 + s.high * 2;
      rig.j.mark.rotation.y = Math.sin(t * 0.8) * 0.5;
      const k = 1 + s.pulse * 0.15;
      rig.j.mark.scale.set(k, k, k);
    },
  };
}

export function createBots() {
  return [buildCodex(), buildClaude(), buildGrok()];
}
