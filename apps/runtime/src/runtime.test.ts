/** 设备本地边界与协议回归；仅隔离临时目录/合成HTTP，不读取用户凭证或真实仓库。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync, symlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { serverOrigin, pair, heartbeat } from './connection.js';
import { saveDevice, readDevice, requireUnpaired, privateDirectory } from './store.js';
import { status } from './daemon.js';

test('平台origin仅HTTPS或显式本机回环HTTP，拒绝凭证/重定向目标路径', () => {
  assert.equal(serverOrigin('http://127.0.0.1:18080'), 'http://127.0.0.1:18080');
  for (const input of ['http://example.com', 'http://localhost:18080', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?q=1']) assert.throws(() => serverOrigin(input));
});
test('设备目录权限、符号链接与不可覆盖，状态不泄露凭证', () => {
  const directory = mkdtempSync(join(tmpdir(), 'c2k-runtime-'));
  try {
    const device = { server: 'http://127.0.0.1:18080', id: '00000000-0000-0000-0000-000000000001', token: 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() };
    saveDevice(directory, device); assert.deepEqual(readDevice(directory), device);
    assert.throws(() => saveDevice(directory, device)); assert.throws(() => requireUnpaired(directory));
    assert.deepEqual(status(directory), { configured: true, running: false });
    assert.equal(JSON.stringify(status(directory)).includes(device.token), false);
    chmodSync(join(directory, 'device.json'), 0o644); assert.throws(() => readDevice(directory));
    chmodSync(join(directory, 'device.json'), 0o600);
    const link = join(directory, 'link'); symlinkSync(directory, link); assert.throws(() => privateDirectory(link));
    const wide = join(directory, 'wide'); mkdirSync(wide, { mode: 0o755 }); chmodSync(wide, 0o755); assert.throws(() => privateDirectory(wide));
    assert.equal(readFileSync(join(directory, 'device.json'), 'utf8').includes(device.token), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('真实合成HTTP验证协议成功、额外字段、重定向及有界响应', async () => {
  let mode = 'ok';
  const server = createServer((request, response) => {
    if (mode === 'redirect') { response.writeHead(302, { Location: 'http://127.0.0.1:1/' }); response.end(); return; }
    if (mode === 'oversize') { response.end('x'.repeat(8193)); return; }
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/runtime/v1/pair') response.end(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', token: 'x'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString(), ...(mode === 'extra' ? { secret: 'forbidden' } : {}) }));
    else response.end(JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', status: 'ONLINE', serverTime: new Date().toISOString() }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('合成端口无效');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const result = await pair(origin, 'a'.repeat(43), '合成设备'); assert.equal(result.token.length, 43);
    assert.equal((await heartbeat(origin, result.token)).status, 'ONLINE');
    for (const failure of ['extra', 'redirect', 'oversize']) { mode = failure; await assert.rejects(pair(origin, 'a'.repeat(43), '合成设备')); }
  } finally { await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())); }
});
