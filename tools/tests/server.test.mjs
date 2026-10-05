import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createDashboardServer } from '../dashboard/server.mjs';

test('HTTP経由でHTML・スクリプト・最新台帳を読み込める', async t => {
  const server = createDashboardServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [['/tools/dashboard/', 'text/html'], ['/tools/dashboard/app.js', 'text/javascript'], ['/tools/dashboard/tasks.js', 'text/javascript'], ['/tasks/tasks.jsonl', 'text/plain']]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(contentType));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert.ok(body.length > 0);
    if (path.endsWith('.jsonl')) assert.equal(body, await readFile(new URL('../../tasks/tasks.jsonl', import.meta.url), 'utf8'));
  }
  const redirect = await fetch(base, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/tools/dashboard/');
  const head = await fetch(base + '/tasks/tasks.jsonl', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/.git/config', '/README.md', '/unknown', '/tools/dashboard/%2e%2e/%2e%2e/.git/config']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  assert.equal((await fetch(base + '/tasks/tasks.jsonl', { method: 'POST' })).status, 405);
});
