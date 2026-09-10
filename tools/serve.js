// Minimal static server for the demo build. No cache headers, because every
// verification pass in this session depends on getting the file just written
// rather than the one from ten minutes ago.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Serves www/ by default, since that is the only thing worth serving here.
const ROOT = process.argv[2] || process.env.SERVE_DIR || path.join(__dirname, '..', 'www');
const PORT = Number(process.argv[3] || process.env.SERVE_PORT || 5607);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let rel = url === '/' ? '/index.html' : url;
  const full = path.join(ROOT, rel);
  // Never serve outside the root, however the path is spelled.
  if (!path.resolve(full).startsWith(path.resolve(ROOT))) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('nf'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
      // no-store is what makes a verification pass see the file just written
      // rather than one from ten minutes ago. It also makes Chrome refuse to
      // register the service worker: sw.js fetches fine (200, correct type)
      // but registration fails with "An unknown error occurred when fetching
      // the script". index.html catches that, so the app boots and works.
      // Do not chase those console errors as an app bug - they are this
      // header. Service worker behaviour cannot be tested through this server.
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
    });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('serving ' + ROOT + ' on http://localhost:' + PORT);
});
