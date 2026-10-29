// DOM controls: add/remove music, beat library, playlist, transport.
import { loadBeats } from './beats.js';

const $ = (s) => document.querySelector(s);
const fmt = (sec) => {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function initUI(engine) {
  const fileInput = $('#file');
  const list = $('#playlist');
  const player = $('#player');
  const empty = $('#empty');
  const playBtn = $('#play');
  const seek = $('#seek');
  const vol = $('#volume');
  const dot = $('#beatdot');
  let seeking = false;

  $('#add').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { engine.addFiles(fileInput.files); fileInput.value = ''; });

  // ---------- beat library menu ----------
  const menu = $('#beatmenu');
  const beatsBtn = $('#beats');
  let library = [];
  loadBeats().then((b) => { library = b; renderMenu(); });

  function renderMenu() {
    menu.innerHTML = '';
    for (const beat of library) {
      const li = document.createElement('li');
      li.innerHTML = `<button><span class="b-title"></span><span class="b-artist"></span><span class="b-state"></span></button>`;
      li.querySelector('.b-title').textContent = beat.title;
      li.querySelector('.b-artist').textContent = beat.artist;
      const cur = engine.tracks[engine.current];
      const isCurrent = cur && cur.key === 'beat:' + beat.id;
      li.querySelector('.b-state').textContent = isCurrent && engine.playing ? '♪' : engine.hasKey('beat:' + beat.id) ? '✓' : '';
      li.classList.toggle('current', !!isCurrent);
      li.querySelector('button').addEventListener('click', () => pickBeat(beat, li));
      menu.appendChild(li);
    }
  }

  async function pickBeat(beat, li) {
    engine.ensureGraph(); // inside the click, so the browser lets audio start
    let url = beat.url;
    if (beat.synth && !engine.hasKey('beat:synth')) {
      li.querySelector('.b-state').textContent = 'mixing…';
      url = await engine.makeDemo();
    }
    const i = engine.addUrl(beat.title, url, 'beat:' + beat.id);
    setMenu(false);
    engine.play(i);
  }

  function setMenu(open) {
    menu.hidden = !open;
    beatsBtn.classList.toggle('open', open);
    if (open) renderMenu();
  }
  beatsBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
  addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // drag & drop anywhere on the page
  addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    engine.addFiles(e.dataTransfer.files);
  });

  // playlist folds away on phones to keep the bots visible
  if (matchMedia('(max-width: 640px)').matches) player.classList.add('collapsed');
  $('#listToggle').addEventListener('click', () => player.classList.toggle('collapsed'));

  playBtn.addEventListener('click', () => engine.toggle());
  $('#prev').addEventListener('click', () => engine.prev());
  $('#next').addEventListener('click', () => engine.next());
  seek.addEventListener('input', () => { seeking = true; $('#cur').textContent = fmt(seek.value * engine.audio.duration); });
  seek.addEventListener('change', () => { engine.seek(+seek.value); seeking = false; });
  vol.addEventListener('input', () => engine.setVolume(+vol.value));
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body && engine.tracks.length) { e.preventDefault(); engine.toggle(); }
  });

  function renderList() {
    const has = engine.tracks.length > 0;
    player.hidden = !has;
    empty.hidden = has;
    list.innerHTML = '';
    engine.tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = i === engine.current ? 'active' : '';
      li.innerHTML = `<span class="idx">${i === engine.current && engine.playing ? '▶' : i + 1}</span>
        <span class="name"></span><button class="rm" title="Remove">✕</button>`;
      li.querySelector('.name').textContent = t.name;
      li.addEventListener('click', () => engine.play(i));
      li.querySelector('.rm').addEventListener('click', (e) => { e.stopPropagation(); engine.remove(t.id); });
      list.appendChild(li);
    });
    $('#title').textContent = engine.current >= 0 ? engine.tracks[engine.current].name : '—';
    $('#count').textContent = engine.tracks.length;
  }

  engine.on((type) => {
    if (type === 'tracks' || type === 'play' || type === 'pause') {
      renderList();
      if (!menu.hidden) renderMenu();
    }
    if (type === 'play' || type === 'pause') playBtn.textContent = engine.playing ? '❚❚' : '▶';
    if ((type === 'timeupdate' || type === 'loadedmetadata') && !seeking) {
      const a = engine.audio;
      seek.value = a.duration ? a.currentTime / a.duration : 0;
      $('#cur').textContent = fmt(a.currentTime);
      $('#dur').textContent = fmt(a.duration);
    }
  });
  renderList();

  return {
    tick(s) {
      dot.style.transform = `scale(${1 + s.pulse * 0.8})`;
      dot.style.opacity = s.playing ? 0.35 + s.pulse * 0.65 : 0.2;
      $('#bpm').textContent = s.playing ? `${engine.bpm} BPM` : '';
    },
  };
}
