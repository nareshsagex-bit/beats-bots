// The beat library shown in the "Beats" menu.
// Files come from the `beats options/` folder (listed by server.js at /api/beats).

// friendly titles for the bundled tracks; anything else gets a name from its filename
const TITLES = {
  'bearstockmusic-disco-603545': { title: 'Disco Fever', artist: 'bearstockmusic' },
  'lnplusmusic-disco-disco-music-614548': { title: 'Mirror Ball', artist: 'lnplusmusic' },
  'paulyudin-disco-disco-music-595944': { title: 'Saturday Strut', artist: 'paulyudin' },
  'the_mountain-beat-513151': { title: 'Mountain Beat', artist: 'the_mountain' },
  'vibehorn-disco-funk-loop-507215': { title: 'Funk Loop', artist: 'vibehorn' },
};

// used when the page isn't served by server.js (e.g. a plain static host)
const FALLBACK = Object.keys(TITLES).map((base) => ({
  file: base + '.mp3',
  url: `beats%20options/${base}.mp3`,
}));

function describe({ file, url }) {
  const base = file.replace(/\.[^.]+$/, '');
  if (TITLES[base]) return { id: base, url, ...TITLES[base] };
  // "artist-some-title-123456" → title "Some Title", artist "artist"
  const parts = base.split('-').filter((p) => !/^\d+$/.test(p));
  const artist = parts.length > 1 ? parts.shift() : '';
  const title = parts.join(' ').replace(/[_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || base;
  return { id: base, url, title, artist };
}

export async function loadBeats() {
  let files = FALLBACK;
  try {
    const res = await fetch('/api/beats');
    if (res.ok) files = await res.json();
  } catch { /* static hosting: keep the fallback list */ }
  return [
    ...files.map(describe),
    { id: 'synth', title: 'Synth Groove', artist: 'generated live · 122 BPM', synth: true },
  ];
}
