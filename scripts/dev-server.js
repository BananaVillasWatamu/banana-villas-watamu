// Local preview server that stands in for `vercel dev`: serves the static
// files, applies the rewrites from vercel.json and runs the api/ handlers
// with a minimal Express-style req/res. Usage: node scripts/dev-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 3000;

// Load .env without a dependency. Existing environment variables win.
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

// Never serve secrets, dependencies or server code as static files.
function isServable(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => p.startsWith('.'))) return false;
  return !['node_modules', 'api', 'supabase', 'backups', 'scripts'].includes(parts[0]);
}

function staticFile(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel || !isServable(rel)) return null;
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function rewrite(pathname) {
  for (const { source, destination } of config.rewrites) {
    const names = [];
    const pattern = source
      .replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))
      .replace('(.*)', '(?:.*)');
    const m = pathname.match(new RegExp(`^${pattern}$`));
    if (m) return names.reduce((d, n, i) => d.replace(`:${n}`, m[i + 1]), destination);
  }
  return null;
}

function apiHandler(pathname) {
  const base = path.join(root, pathname);
  for (const file of [`${base}.js`, path.join(base, 'index.js')]) {
    if (file.startsWith(path.join(root, 'api')) && fs.existsSync(file)) return file;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(data);
      }
    });
  });
}

async function runApi(file, url, req, res) {
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  res.status = (code) => ((res.statusCode = code), res);
  res.send = (body) => {
    if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(body);
    return res;
  };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  res.redirect = (a, b) => {
    const [code, loc] = typeof a === 'number' ? [a, b] : [307, a];
    res.writeHead(code, { Location: loc }).end();
    return res;
  };
  delete require.cache[require.resolve(file)];
  await require(file)(req, res);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      let target = url.pathname;
      if (!target.startsWith('/api/')) {
        const file = staticFile(target);
        if (file) {
          res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
          return fs.createReadStream(file).pipe(res);
        }
        const dest = rewrite(target);
        if (!dest) return res.writeHead(404).end('Not found');
        const destUrl = new URL(dest, url);
        url.searchParams.forEach((v, k) => destUrl.searchParams.set(k, v));
        target = destUrl.pathname;
        url.search = destUrl.search;
      }
      const handler = apiHandler(target);
      if (!handler) return res.writeHead(404).end('Not found');
      await runApi(handler, url, req, res);
    } catch (err) {
      console.error(req.method, req.url, err);
      if (!res.headersSent) res.writeHead(500);
      res.end('Server error');
    }
    console.log(req.method, req.url, res.statusCode);
  })
  .listen(port, () => console.log(`Banana Villas preview on http://localhost:${port}`));
