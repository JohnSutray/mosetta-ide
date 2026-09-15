const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  const clean = req.url.split('?')[0];
  const file = clean.endsWith('/') ? `${clean}index.html` : clean;
  const at = path.join(root, file);
  if (!at.startsWith(root) || !fs.existsSync(at)) {
    res.writeHead(404).end('not here');
    return;
  }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(fs.readFileSync(at));
});
server.listen(0, '127.0.0.1', () => {
  console.log(`\x1b[32mready\x1b[0m listening on http://127.0.0.1:${server.address().port}/web/ (open it)`);
});
