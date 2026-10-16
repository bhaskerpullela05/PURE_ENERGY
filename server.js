/**
 * server.js
 * ---------
 * Zero-dependency local development server for PuREPower Lead Router.
 * Uses Node.js standard modules (http, fs, path).
 * Emulates Firebase Hosting rewrite and correct MIME types.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Normalize URL path to prevent directory traversal
  let safePath = path.normalize(req.url.split('?')[0]).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: rewrite to index.html if file doesn't exist
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 - Internal Server Error');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  ⚡ PuREPower Lead Router is running!`);
  console.log(`  🔗 Local URL: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
