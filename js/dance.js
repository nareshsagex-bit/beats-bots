// Beat-synced procedural dance moves.
// A move writes a target pose; the engine smoothly blends each bot toward it.
//
// Rotation conventions (bot faces +z):
//   shoulderL.z > 0 raises the left arm sideways, shoulderR.z < 0 the right.
//   shoulder.x < 0 swings an arm forward; thigh.x < 0 lifts a leg forward;
//   knee.x > 0 bends a knee; elbow.x < 0 bends an elbow forward.

const TAU = Math.PI * 2;
const JOINTS = ['hips', 'spine', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
  'handL', 'handR', 'thighL', 'thighR', 'kneeL', 'kneeR', 'footL', 'footR'];

function blankPose() {
  const p = { y: 0, x: 0, yaw: 0 };
  for (const k of JOINTS) p[k] = [0, 0, 0];
  return p;
}

// arms hanging relaxed
function rest(p) {
  p.shoulderL[2] = 0.12; p.shoulderR[2] = -0.12;
  p.elbowL[0] = -0.15; p.elbowR[0] = -0.15;
}

// knee bend that stays planted: thigh forward, knee back, foot level
function crouch(p, side, d) {
  p['thigh' + side][0] -= d * 0.55;
  p['knee' + side][0] += d * 1.1;
  p['foot' + side][0] -= d * 0.55;
}

// how deep we dip on the beat: 1 right on it, easing back up
const dip = (ph) => Math.pow(0.5 + 0.5 * Math.cos(ph * TAU), 2);

export const MOVES = {
  idle(p, s) {
    rest(p);
    const br = Math.sin(s.t * 1.6 + s.seed);
    p.spine[0] = br * 0.02;
    p.head[1] = Math.sin(s.t * 0.5 + s.seed) * 0.35;
    p.head[0] = Math.sin(s.t * 0.9 + s.seed) * 0.05;
    p.shoulderL[2] += br * 0.03; p.shoulderR[2] -= br * 0.03;
  },

  bounce(p, s) {
    const d = dip(s.phase) * s.amp;
    rest(p);
    p.y = -d * 0.09;
    crouch(p, 'L', d * 0.5); crouch(p, 'R', d * 0.5);
    const alt = s.beat % 2 ? 1 : -1;
    p.shoulderL[0] = -0.3 - d * 0.5 * alt; p.shoulderR[0] = -0.3 + d * 0.5 * alt;
    p.elbowL[0] = -1.1; p.elbowR[0] = -1.1;
    p.head[0] = d * 0.25;
    p.spine[0] = d * 0.08;
  },

  pump(p, s) {
    // fist pump: one arm punches up on each beat
    const d = dip(s.phase) * s.amp;
    rest(p);
    const side = s.beat % 2 ? 'L' : 'R';
    const sg = side === 'L' ? 1 : -1;
    p['shoulder' + side][0] = -2.4 - d * 0.5;
    p['shoulder' + side][2] = sg * 0.3;
    p['elbow' + side][0] = -0.6 + d * 0.5;
    const other = side === 'L' ? 'R' : 'L';
    p['shoulder' + other][0] = -0.2; p['elbow' + other][0] = -1.4;
    p.y = -d * 0.07;
    crouch(p, 'L', d * 0.4); crouch(p, 'R', d * 0.4);
    p.head[0] = -0.2 + d * 0.3;
    p.spine[2] = sg * 0.08;
  },

  armWave(p, s) {
    // both arms up, rolling wave, hips swaying
    const w = s.phase * TAU + s.beat * Math.PI;
    const a = s.amp;
    p.shoulderL[2] = 2.3 + Math.sin(w) * 0.35 * a; p.shoulderR[2] = -2.3 + Math.sin(w) * 0.35 * a;
    p.elbowL[2] = Math.sin(w - 1) * 0.6 * a; p.elbowR[2] = Math.sin(w - 1) * 0.6 * a;
    p.x = Math.sin(w) * 0.06 * a;
    p.hips[2] = Math.sin(w) * 0.1 * a;
    p.spine[2] = -Math.sin(w) * 0.14 * a;
    p.head[2] = Math.sin(w) * 0.15;
    const d = dip(s.phase) * a;
    p.y = -d * 0.05;
    crouch(p, 'L', d * 0.3); crouch(p, 'R', d * 0.3);
  },

  sideStep(p, s) {
    // step out and in, clapping on the off-beat
    const dir = s.beat % 2 ? 1 : -1;
    const ease = 0.5 - 0.5 * Math.cos(Math.min(1, s.phase * 2) * Math.PI);
    const side = dir > 0 ? 'L' : 'R';
    p.x = dir * (ease - 0.5) * 0.2 * s.amp;
    p.hips[2] = -dir * 0.08 * s.amp;
    p.spine[2] = dir * 0.12 * s.amp;
    p['thigh' + side][2] = dir * 0.25 * Math.sin(s.phase * Math.PI) * s.amp;
    p['knee' + side][0] = 0.6 * Math.sin(s.phase * Math.PI) * s.amp;
    const clap = Math.pow(Math.abs(Math.sin(s.phase * Math.PI)), 6);
    p.shoulderL[0] = -0.9; p.shoulderR[0] = -0.9;
    p.shoulderL[1] = 0.7 * (1 - clap) + 0.3; p.shoulderR[1] = -0.7 * (1 - clap) - 0.3;
    p.shoulderL[2] = 0.3; p.shoulderR[2] = -0.3;
    p.elbowL[0] = -0.9; p.elbowR[0] = -0.9;
    p.head[2] = dir * 0.12;
  },

  clap(p, s) {
    // clap on every beat with a knee pop
    const d = dip(s.phase) * s.amp;
    p.shoulderL[0] = -1.2; p.shoulderR[0] = -1.2;
    p.shoulderL[1] = 0.25 + (1 - d) * 0.6; p.shoulderR[1] = -0.25 - (1 - d) * 0.6;
    p.elbowL[0] = -0.6; p.elbowR[0] = -0.6;
    p.y = -d * 0.08;
    crouch(p, 'L', d * 0.5); crouch(p, 'R', d * 0.5);
    p.head[0] = d * 0.2;
    p.yaw = Math.sin(s.beat * Math.PI / 4) * 0.3;
  },

  robot(p, s) {
    // snaps between hard poses each beat
    const poses = [
      { sl: [-1.57, 0, 0.1], sr: [0, 0, -0.1], el: [0, 0, 0], er: [-1.57, 0, 0], h: [0, 0.6, 0], sp: [0, 0.2, 0] },
      { sl: [0, 0, 1.57], sr: [0, 0, -1.57], el: [0, 0, 1.4], er: [0, 0, -1.4], h: [0, 0, 0], sp: [0, 0, 0] },
      { sl: [0, 0, 0.1], sr: [-1.57, 0, -0.1], el: [-1.57, 0, 0], er: [0, 0, 0], h: [0, -0.6, 0], sp: [0, -0.2, 0] },
      { sl: [-3.0, 0, 0.2], sr: [-3.0, 0, -0.2], el: [0, 0, 0], er: [0, 0, 0], h: [-0.25, 0, 0], sp: [0, 0, 0] },
    ];
    const q = poses[s.beat % poses.length];
    // tiny overshoot right on the beat = mechanical "tick"
    const tick = 1 + Math.max(0, 0.12 - s.phase) * 1.5 * s.amp;
    p.shoulderL = q.sl.map((v) => v * tick); p.shoulderR = q.sr.map((v) => v * tick);
    p.elbowL = q.el.slice(); p.elbowR = q.er.slice();
    p.head = q.h.slice(); p.spine = q.sp.slice();
    const leg = s.beat % 2 ? 'L' : 'R';
    crouch(p, leg, 0.35 * s.amp);
    p.y = -0.03 * s.amp;
  },

  disco(p, s) {
    // point up-diagonal, then down across the body
    const up = s.beat % 2 === 0;
    const side = (s.beat >> 2) % 2 ? 'L' : 'R';
    const sg = side === 'L' ? 1 : -1;
    p['shoulder' + side] = up ? [-0.6, 0, sg * 2.5] : [-0.7, 0, -sg * 0.5];
    p['elbow' + side] = [0, 0, 0];
    const other = side === 'L' ? 'R' : 'L';
    p['shoulder' + other] = [0, 0, -sg * 0.6]; p['elbow' + other] = [-1.6, 0, 0];
    p.hips[2] = (up ? sg : -sg) * 0.1 * s.amp;
    p.spine[2] = (up ? sg : -sg) * 0.12 * s.amp;
    p.head[2] = (up ? sg : -sg) * 0.2;
    p.head[1] = (up ? sg : -sg) * 0.3;
    const d = dip(s.phase) * s.amp;
    p.y = -d * 0.05;
    crouch(p, 'L', d * 0.3); crouch(p, 'R', d * 0.3);
  },

  headbang(p, s) {
    const d = dip(s.phase) * s.amp;
    p.spine[0] = 0.15 + d * 0.3;
    p.neck[0] = d * 0.4;
    p.head[0] = d * 0.5 - 0.1;
    p.shoulderL = [-0.8, 0, 0.5]; p.shoulderR = [-0.8, 0, -0.5];
    p.elbowL[0] = -1.2 - d * 0.3; p.elbowR[0] = -1.2 - d * 0.3;
    p.y = -0.06 - d * 0.06;
    p.thighL[2] = 0.15; p.thighR[2] = -0.15;
    crouch(p, 'L', 0.35 + d * 0.3); crouch(p, 'R', 0.35 + d * 0.3);
  },

  spin(p, s) {
    // full turn over two beats, arms out, then a pose
    const local = ((s.beat % 4) + s.phase) / 2; // 0..2 over four beats
    const turn = Math.min(1, local);
    p.yaw = (1 - Math.cos(turn * Math.PI)) * Math.PI; // 0 → 2π eased
    p.shoulderL[2] = 1.4; p.shoulderR[2] = -1.4;
    p.elbowL[2] = 0.2; p.elbowR[2] = -0.2;
    if (local >= 1) {
      p.shoulderL = [-2.6, 0, 0.6]; p.shoulderR = [0, 0, -0.4];
      p.head[0] = -0.2;
    }
    const d = dip(s.phase) * s.amp;
    p.y = -d * 0.04 + (turn < 1 ? Math.sin(turn * Math.PI) * 0.05 : 0);
    crouch(p, 'L', d * 0.3); crouch(p, 'R', d * 0.3);
  },
};

/** Drives one bot: picks moves on 8-beat phrases and blends poses. */
export class Dancer {
  constructor(bot, index) {
    this.bot = bot;
    this.index = index;
    this.seed = index * 1.7;
    this.pose = blankPose();
    this.yaw = 0;
    this.lastPhrase = -1;
    this.move = 'idle';
  }

  pickMove(phrase) {
    const list = this.bot.moves;
    // every 4th phrase everybody does the same thing (unison moment)
    if (phrase % 4 === 3) return ['bounce', 'clap', 'disco', 'robot'][(phrase >> 2) % 4];
    return list[(phrase + this.index * 2) % list.length];
  }

  update(dt, s) {
    const target = blankPose();
    let move = 'idle';
    if (s.playing) {
      const phrase = Math.floor(s.beat / 8);
      if (phrase !== this.lastPhrase) {
        this.lastPhrase = phrase;
        this.move = this.pickMove(phrase);
      }
      move = this.move;
    }
    MOVES[move](target, { ...s, seed: this.seed, amp: s.playing ? 0.55 + s.energy * 0.6 : 0 });

    // robot snaps fast, everybody else glides
    const speed = move === 'robot' ? 22 : 11;
    const k = 1 - Math.exp(-dt * speed);
    const j = this.bot.j;
    for (const name of JOINTS) {
      const cur = this.pose[name];
      const tgt = target[name];
      for (let i = 0; i < 3; i++) cur[i] += (tgt[i] - cur[i]) * k;
      j[name].rotation.set(cur[0], cur[1], cur[2]);
    }
    this.pose.y += (target.y - this.pose.y) * k;
    this.pose.x += (target.x - this.pose.x) * k;
    j.hips.position.y = j.hips.userData.rest.y + this.pose.y;
    j.hips.position.x = this.pose.x;

    // yaw: always turn the short way so a finished spin (2π) settles at 0
    let diff = target.yaw - this.yaw;
    diff = ((diff + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.yaw += diff * (move === 'spin' ? Math.min(1, dt * 20) : k);
    this.bot.root.rotation.y = this.yaw;

    this.bot.update(s.t, s);
  }
}
