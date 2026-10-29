// Tiny zero-dependency static server: `node server.js` → http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

const BEATS_DIR = 'beats options';

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // list whatever audio sits in the beats folder, so new beats show up without code changes
  if (url === '/api/beats') {
    fs.readdir(path.join(ROOT, BEATS_DIR), (err, names = []) => {
      const files = (err ? [] : names).filter((n) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(n));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files.map((n) => ({ file: n, url: `/${encodeURIComponent(BEATS_DIR)}/${encodeURIComponent(n)}` }))));
    });
    return;
  }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    };
    // browsers need byte ranges to know an mp3's duration and to seek in it
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? +m[1] : stat.size - +m[2];
      const end = m[1] && m[2] ? Math.min(+m[2], stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log(`Beats Bots → http://localhost:${PORT}`));
