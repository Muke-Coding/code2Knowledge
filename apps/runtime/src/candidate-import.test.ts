/** 候选导入CLI边界测试；使用合成Git与假HTTP，不访问客户仓库、模型或通知；真实授权由后端集成测试覆盖。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { saveDevice } from './store.js';
import { bindSource } from './source-bindings.js';
/** @param rejectResponse 是否模拟平台拒绝 @param bind 是否显式本机许可 @returns CLI退出与有界安全输出；finally销毁服务器及合成仓库 */
async function scenario(rejectResponse: boolean, bind: boolean): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'c2k-import-cli-')); let requests = 0;
  const server = createServer((request, response) => {
    requests++; assert.equal(request.url, '/runtime/v1/candidates'); assert.equal(request.method, 'POST');
    assert.match(request.headers['content-type'] ?? '', /^multipart\/form-data;/);
    request.resume(); request.on('end', () => { response.writeHead(rejectResponse ? 403 : 201, { 'Content-Type': 'application/json' }); response.end(rejectResponse ? '{"detail":"SECRET-MUST-NOT-PRINT"}' : '{"id":"11111111-1111-1111-1111-111111111111"}'); });
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('address');
    const home = join(root, 'device'); const repo = join(root, 'repo'); await mkdir(repo); execFileSync('git', ['init', '-q', repo]);
    saveDevice(home, { server: `http://127.0.0.1:${address.port}`, id: '22222222-2222-2222-2222-222222222222', token: 'T'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' });
    const source = '33333333-3333-3333-3333-333333333333'; if (bind) bindSource(home, source, 1, repo);
    const archive = join(root, 'knowledge.zip'); execFileSync('/usr/bin/zip', ['-q', '-r', archive, '.'], { cwd: fileURLToPath(new URL('../../../verification/fixtures/skill-2.0/', import.meta.url)) });
    const mapping = join(root, 'bindings.json'); await writeFile(mapping, JSON.stringify([{ sourceId: source, revision: 1, repository: 'fixture-core', commit: 'a'.repeat(40) }]));
    const child = spawn(process.execPath, [fileURLToPath(new URL('./cli.js', import.meta.url)), 'import-candidate', '--archive', archive, '--bindings', mapping, '--request', '44444444-4444-4444-4444-444444444444'], { env: { ...process.env, C2K_RUNTIME_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', (value) => { output += String(value); }); child.stderr.on('data', (value) => { output += String(value); });
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, bind && !rejectResponse ? 0 : 1); assert.equal(requests, bind ? 1 : 0); assert.equal(output.includes('SECRET-MUST-NOT-PRINT'), false); assert.equal(output.includes('T'.repeat(43)), false);
    if (bind) assert.match(output, /44444444-4444-4444-4444-444444444444/); if (bind && !rejectResponse) assert.match(output, /未审核、未发布/);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
}
test('合成仓库显式许可后CLI上传原包，保持请求ID且不泄露设备凭证', async () => { await scenario(false, true); });
test('无本机许可禁止HTTP提交，平台拒绝只输出安全提示且保留请求ID', async () => { await scenario(false, false); await scenario(true, true); });
