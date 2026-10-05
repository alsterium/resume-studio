import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/tools/dashboard/', ['index.html', 'text/html; charset=utf-8']],
  ['/tools/dashboard/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/tools/dashboard/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/tools/dashboard/tasks.js', ['tasks.js', 'text/javascript; charset=utf-8']],
  ['/tasks/tasks.jsonl', ['../../tasks/tasks.jsonl', 'text/plain; charset=utf-8']],
]);

export function createDashboardServer() {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (pathname === '/') {
      response.writeHead(302, { Location: '/tools/dashboard/' }).end();
      return;
    }
    const route = routes.get(pathname);
    if (!route) { response.writeHead(404).end('Not found'); return; }
    try {
      const content = await readFile(new URL(route[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': route[1], 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(500).end('Unable to read dashboard resource');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || process.argv.length > 3) {
    console.error('Usage: node tools/dashboard/server.mjs [port: 1..65535]');
    process.exitCode = 1;
  } else {
    const server = createDashboardServer();
    server.on('error', error => {
      console.error(`ダッシュボードを起動できません: ${error.code}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/tools/dashboard/`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
  }
}
