const http = require('http');
const fs = require('fs');
const path = require('path');

const mime = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon'
};

const base = __dirname;
const port = 8001;

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let p = path.join(base, url);
  if (url === '/' || url === '') p = path.join(base, 'index.html');

  // Block path traversal
  if (!p.startsWith(base)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(d);
  });
}).listen(port, () => {
  console.log(`Cosmogenesis serving on http://localhost:${port}`);
});
