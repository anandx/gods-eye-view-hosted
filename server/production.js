import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import connect from 'connect';
import serveStatic from 'serve-static';
import { localProviderPlugins } from './providers/local.js';
import { apiNotFoundPlugin } from './standalone/api-not-found.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const index = await readFile(path.join(dist, 'index.html'));
const app = connect();
const httpServer = createServer(app);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/healthz', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('ok');
});

// Keep anonymous visitors from driving the upstream data proxies indefinitely.
// Render supplies the original client address in X-Forwarded-For.
const clients = new Map();
const apiRequestsPerMinute = 120;
app.use('/api', (req, res, next) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const client = isIP(forwarded) ? forwarded : req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const previous = clients.get(client);
  const bucket = previous && now - previous.started < 60_000
    ? previous
    : { started: now, count: 0 };
  bucket.count += 1;
  clients.set(client, bucket);
  if (bucket.count > apiRequestsPerMinute) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': '60',
    });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }
  next();
});
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [client, bucket] of clients) {
    if (bucket.started < cutoff) clients.delete(client);
  }
}, 60_000).unref();

// The project's API providers are Connect middleware. Use their preview hooks
// in a long-running Node process, without exposing Vite's development server.
const providerServer = { middlewares: app, httpServer };
for (const plugin of [...localProviderPlugins(), apiNotFoundPlugin()]) {
  plugin.configurePreviewServer?.(providerServer);
}

app.use(serveStatic(dist, {
  index: false,
  setHeaders(res, file) {
    res.setHeader('Cache-Control', file === path.join(dist, 'index.html')
      ? 'no-cache'
      : file.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600');
  },
}));

app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : index);
});

const port = Number.parseInt(process.env.PORT || '10000', 10);
const host = process.env.HOST || '0.0.0.0';
httpServer.listen(port, host, () => {
  console.log(`God's Eye View listening on ${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
