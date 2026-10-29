// Playlist + playback + real-time beat detection (Web Audio API).

export class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.tracks = [];          // { id, name, url }
    this.current = -1;
    this.ctx = null;
    this.listeners = new Set();
    this.nextId = 1;

    // analysis state
    this.bands = new Array(9).fill(0);
    this.bass = 0; this.mid = 0; this.high = 0; this.energy = 0;
    this.pulse = 0;            // 1 on a beat, decays to 0
    this.phase = 0;            // 0..1 position inside the current beat
    this.beat = 0;             // running beat counter
    this.period = 0.5;         // seconds per beat (120 BPM until we learn better)
    this.history = [];
    this.intervals = [];
    this.lastOnset = 0;

    this.audio.addEventListener('ended', () => this.next(true));
    for (const ev of ['play', 'pause', 'loadedmetadata', 'timeupdate', 'volumechange'])
      this.audio.addEventListener(ev, () => this.emit(ev));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type) { for (const fn of this.listeners) fn(type); }

  get playing() { return !this.audio.paused && !this.audio.ended && this.current >= 0; }
  get bpm() { return Math.round(60 / this.period); }

  ensureGraph() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    src.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
  }

  // ---------- playlist ----------
  addFiles(files) {
    const before = this.tracks.length;
    for (const f of files) {
      if (!f.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(f.name)) continue;
      this.tracks.push({ id: this.nextId++, name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    }
    if (this.current < 0 && this.tracks.length > before) this.load(before);
    this.emit('tracks');
  }

  /** Adds a track by URL (once per `key`) and returns its playlist index. */
  addUrl(name, url, key = url) {
    const existing = this.tracks.findIndex((t) => t.key === key);
    if (existing >= 0) return existing;
    this.tracks.push({ id: this.nextId++, name, url, key });
    if (this.current < 0) this.load(this.tracks.length - 1);
    this.emit('tracks');
    return this.tracks.length - 1;
  }
  hasKey(key) { return this.tracks.some((t) => t.key === key); }

  remove(id) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const [t] = this.tracks.splice(i, 1);
    if (i === this.current) {
      const wasPlaying = this.playing;
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.current = -1;
      if (this.tracks.length) {
        this.load(Math.min(i, this.tracks.length - 1));
        if (wasPlaying) this.play();
      }
    } else if (i < this.current) {
      this.current--;
    }
    if (t.url.startsWith('blob:')) URL.revokeObjectURL(t.url);
    this.emit('tracks');
  }

  load(i) {
    this.current = i;
    this.audio.src = this.tracks[i].url;
    this.resetBeat();
    this.emit('tracks');
  }

  async play(i) {
    if (!this.tracks.length) return;
    this.ensureGraph();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (i !== undefined && i !== this.current) this.load(i);
    if (this.current < 0) this.load(0);
    try { await this.audio.play(); } catch (e) { console.warn(e); }
  }
  pause() { this.audio.pause(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  next(auto = false) {
    if (!this.tracks.length) return;
    const last = this.current >= this.tracks.length - 1;
    if (auto && last) { this.emit('pause'); return; }
    this.play((this.current + 1) % this.tracks.length);
  }
  prev() {
    if (!this.tracks.length) return;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    this.play((this.current - 1 + this.tracks.length) % this.tracks.length);
  }
  seek(frac) { if (this.audio.duration) this.audio.currentTime = frac * this.audio.duration; }
  setVolume(v) { this.audio.volume = v; }

  // ---------- beat tracking ----------
  resetBeat() {
    this.history.length = 0;
    this.intervals.length = 0;
    this.phase = 0;
    this.lastOnset = 0;
  }

  update(dt) {
    const now = performance.now() / 1000;
    this.pulse = Math.max(0, this.pulse - dt * 4);

    if (!this.playing || !this.analyser) {
      for (let i = 0; i < this.bands.length; i++) this.bands[i] *= 0.9;
      this.bass *= 0.9; this.mid *= 0.9; this.high *= 0.9; this.energy *= 0.95;
      return;
    }

    this.analyser.getByteFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const avg = (lo, hi) => {
      const a = Math.max(1, Math.floor(lo / binHz)), b = Math.max(a + 1, Math.floor(hi / binHz));
      let s = 0;
      for (let k = a; k < b; k++) s += this.freq[k];
      return s / (b - a) / 255;
    };
    this.bass = avg(30, 150);
    this.mid = avg(150, 2000);
    this.high = avg(2000, 9000);
    const edges = [30, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 14000];
    for (let i = 0; i < this.bands.length; i++) this.bands[i] = avg(edges[i], edges[i + 1]);
    this.energy += ((this.bass * 0.6 + this.mid * 0.3 + this.high * 0.1) - this.energy) * 0.05;

    // onset = bass energy jumps well above its recent average
    const e = this.bass;
    this.history.push(e);
    if (this.history.length > 45) this.history.shift();
    const mean = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    const varc = this.history.reduce((a, b) => a + (b - mean) ** 2, 0) / this.history.length;
    const threshold = mean + Math.max(0.04, Math.sqrt(varc) * 1.2);
    const onset = e > threshold && e > 0.25 && now - this.lastOnset > 0.27;

    // free-running beat clock, nudged into lock by detected onsets
    this.phase += dt / this.period;
    if (this.phase >= 1) { this.phase -= 1; this.beat++; this.pulse = Math.max(this.pulse, 0.6); }

    if (onset) {
      if (this.lastOnset) {
        let iv = now - this.lastOnset;
        while (iv > 0.8) iv /= 2;   // fold into 75–170 BPM
        while (iv < 0.35) iv *= 2;
        this.intervals.push(iv);
        if (this.intervals.length > 12) this.intervals.shift();
        const sorted = [...this.intervals].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        this.period += (median - this.period) * 0.3;
      }
      this.lastOnset = now;
      this.pulse = 1;
      if (this.phase > 0.5) { this.beat++; this.phase = 0; } // we were late: count it now
      else this.phase *= 0.5;                                 // just past a beat: pull back in
    }
  }

  // ---------- built-in demo track (synthesised, so there's always something to play) ----------
  async makeDemo(bpm = 122, bars = 16) {
    const sr = 44100;
    const beat = 60 / bpm;
    const dur = bars * 4 * beat;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const kick = (t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.45);
    };
    const hit = (t, freq, len, vol, type = 'highpass') => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise;
      f.type = type; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      s.connect(f).connect(g).connect(master);
      s.start(t); s.stop(t + len + 0.02);
    };
    const note = (t, freq, len, vol, wave = 'sawtooth', cutoff = 900) => {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = wave; o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff * 2.5, t);
      f.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(f).connect(g).connect(master);
      o.start(t); o.stop(t + len + 0.02);
    };

    const roots = [55, 55, 43.65, 49]; // A, A, F, G
    const chord = [[220, 261.6, 329.6], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat;
      const ci = bar % 4;
      const intro = bar < 2;
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        kick(t);
        if (!intro && (b === 1 || b === 3)) hit(t, 1500, 0.18, 0.5, 'bandpass');
        hit(t + beat / 2, 7000, 0.05, 0.25);
        if (!intro) hit(t + beat * 0.75, 9000, 0.03, 0.12);
        // off-beat bass
        note(t + beat / 2, roots[ci] * 2, beat * 0.45, 0.35, 'sawtooth', 500);
      }
      if (!intro) for (const f of chord[ci]) note(t0 + beat * 1.5, f, beat * 0.6, 0.06, 'square', 2200);
      if (bar % 4 === 3 && !intro) for (let i = 0; i < 4; i++) hit(t0 + 3 * beat + i * beat / 4, 1200, 0.1, 0.35, 'bandpass');
    }

    const buf = await ctx.startRendering();
    return URL.createObjectURL(encodeWav(buf));
  }
}

function encodeWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([data], { type: 'audio/wav' });
}
