/** 真实隔离合成Git仓库预检测试；不联网、不运行业务代码，验证固定commit、工作区不变、许可边界与进程组取消。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, realpathSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { preflight } from './preflight.js';
import { bindSource, sourceBinding, unbindSource } from './source-bindings.js';
import { saveDevice } from './store.js';
import { executeTask } from './task-runner.js';
import { start, stop } from './daemon.js';
/** @param root 测试独立临时根 @returns 两次提交的普通Git仓库，默认main，不关联远端 */
function repository(root: string): string {
  const repo = join(root, 'repository'); mkdirSync(repo); execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' });
  writeFileSync(join(repo, 'README.md'), '合成预检原料，不含客户信息\n');
  execFileSync('git', ['-C', repo, 'add', '.']); execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', '合成初始提交'], { stdio: 'ignore' }); return realpathSync(repo);
}
/** @param root 合成临时根 @returns 与合成回环平台绑定的私有设备根，凭证只保存临时文件 */
function home(root: string): string { const home = join(root, 'runtime'); saveDevice(home, { server: 'http://127.0.0.1:18888', id: randomUUID(), token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() }); return home; }
test('真实Git固定main提交，归档忽略脏工作区和未跟踪文件，运行后分支和状态不变', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-preflight-'));
  try {
    const repo = repository(root); const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync(join(repo, 'README.md'), '开发者尚未提交的修改'); writeFileSync(join(repo, 'untracked.md'), '不得进入快照');
    const before = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
    const result = await preflight(repo, 'main', join(root, 'job')); assert.equal(result.outcome, 'SUCCEEDED'); assert.equal(result.commitId, commit); assert.equal(result.fileCount, 1); assert.match(result.archiveSha256, /^[a-f0-9]{64}$/); assert.ok(result.archiveBytes > 0);
    assert.equal(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' }), before); assert.equal(readFileSync(join(repo, 'README.md'), 'utf8'), '开发者尚未提交的修改');
    assert.equal(execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main'); assert.ok(!JSON.stringify(result).includes(repo));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('明确绑定来源与设备和版本，链接.git与分支注入及不存在分支均拒绝', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-binding-'));
  try {
    const repo = repository(root), runtime = home(root), source = randomUUID(); assert.equal(sourceBinding(runtime, source), null);
    bindSource(runtime, source, 2, repo); assert.equal(sourceBinding(runtime, source)?.revision, 2); unbindSource(runtime, source); assert.equal(sourceBinding(runtime, source), null); unbindSource(runtime, source); assert.throws(() => bindSource(runtime, '../outside', 0, repo));
    await assert.rejects(preflight(repo, '--output=/tmp/escape', join(root, 'bad1'))); await assert.rejects(preflight(repo, 'missing', join(root, 'bad2')));
    const alias = join(root, 'alias'); mkdirSync(alias); symlinkSync(join(repo, '.git'), join(alias, '.git')); assert.throws(() => bindSource(runtime, randomUUID(), 0, alias));
    assert.equal(execFileSync('git', ['-C', repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('submodule引用不能静默漏入来源清单，拒绝后不解包或执行内容', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-submodule-'));
  try {
    const repo = repository(root); const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', repo, 'update-index', '--add', '--cacheinfo', `160000,${commit},external`]); execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', '合成依赖引用'], { stdio: 'ignore' });
    await assert.rejects(preflight(repo, 'main', join(root, 'job'))); assert.equal(existsSync(join(root, 'job', 'source.tar')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('daemon停止信号终止独立预检进程组并清理本次目录，不提交取消后的结果', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-cancel-')); let reports = 0;
  const server = createServer((_request, response) => { reports++; response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ valid: true, state: 'RUNNING' })); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const previousPath = process.env.PATH;
  try {
    const repo = repository(root), runtime = home(root), sourceId = randomUUID(), deviceId = randomUUID();
    // 合成Git包装器仅用于让取消时序可重复；不替代前述真实Git固定commit验收。
    const bin = join(root, 'bin'); mkdirSync(bin); writeFileSync(join(bin, 'git'), `#!${process.execPath}\nimport('node:fs').then(fs=>{fs.writeFileSync(${JSON.stringify(join(root, 'worker-started'))},String(process.pid));setTimeout(()=>{},30000)});\n`, { mode: 0o700 });
    bindSource(runtime, sourceId, 0, repo); process.env.PATH = `${bin}:${previousPath ?? '/usr/bin:/bin'}`;
    const controller = new AbortController(); const attemptId = randomUUID();
    const work = executeTask(runtime, { server: `http://127.0.0.1:${address.port}`, id: deviceId, token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() }, { available: true, taskId: randomUUID(), attemptId, leaseId: randomUUID(), fence: 1, sourceId, sourceRevision: 0, branch: 'main' }, controller.signal);
    for (let count = 0; count < 100 && !existsSync(join(root, 'worker-started')); count++) await new Promise((done) => setTimeout(done, 20));
    assert.equal(existsSync(join(root, 'worker-started')), true); controller.abort(); await work;
    assert.equal(existsSync(join(runtime, 'jobs', attemptId)), false); assert.equal(reports, 0);
    const pid = Number(readFileSync(join(root, 'worker-started'), 'utf8')); assert.throws(() => process.kill(pid, 0));
  } finally { if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; await new Promise<void>((done) => server.close(() => done())); rmSync(root, { recursive: true, force: true }); }
});

test('promisor仓库缺本地对象时固定失败，不隐式拉取远端、不执行仓库credential helper', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-promisor-'));
  try {
    const repo = repository(root); const blob = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD:README.md'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['-C', repo, 'config', 'remote.origin.url', 'https://example.invalid/forbidden.git']); execFileSync('git', ['-C', repo, 'config', 'remote.origin.promisor', 'true']); execFileSync('git', ['-C', repo, 'config', 'remote.origin.partialclonefilter', 'blob:none']);
    const remote = join(root, 'remote'); cpSync(repo, remote, { recursive: true }); execFileSync('git', ['-C', repo, 'config', 'remote.origin.url', `file://${remote}`]);
    const marker = join(root, 'helper-called'); execFileSync('git', ['-C', repo, 'config', 'credential.helper', `!touch '${marker}'`]);
    rmSync(join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
    await assert.rejects(preflight(repo, 'main', join(root, 'job'))); assert.equal(existsSync(marker), false);
    assert.equal(existsSync(join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2))), false);

  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('建议诊断500不阻塞任务，执行中临时心跳500仍终止工作且daemon恢复', async () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-reconnect-')); let pulses = 0; let claims = 0; let runtime = ''; let sourceId = ''; let attemptId = ''; const controller = new AbortController();
  const previousPath = process.env.PATH;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/runtime/v1/heartbeat') {
      pulses++; if (pulses === 2) { response.writeHead(500); response.end('{}'); return; }
      response.end(JSON.stringify({ id: deviceId, status: 'ONLINE', serverTime: new Date().toISOString() }));
      if (pulses >= 3) stop(runtime); return;
    }
    if (request.url === '/runtime/v1/readiness/claim') { response.writeHead(500); response.end('{}'); return; }
    if (request.url === '/runtime/v1/tasks/claim') { claims++; response.end(JSON.stringify(claims === 1 ? { available: true, taskId: randomUUID(), attemptId, leaseId: randomUUID(), fence: 1, sourceId, sourceRevision: 0, branch: 'main' } : { available: false, taskId: '', attemptId: '', leaseId: '', fence: 0, sourceId: '', sourceRevision: 0, branch: '' })); return; }
    response.end(JSON.stringify({ valid: true, state: 'RUNNING' }));
  });
  const deviceId = randomUUID(); await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  let daemon: Promise<void> | undefined; let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const repo = repository(root); runtime = join(root, 'runtime'); sourceId = randomUUID(); attemptId = randomUUID();
    saveDevice(runtime, { server: `http://127.0.0.1:${address.port}`, id: deviceId, token: 'a'.repeat(43), expiresAt: new Date(Date.now() + 120000).toISOString() }); bindSource(runtime, sourceId, 0, repo);
    const bin = join(root, 'bin'); mkdirSync(bin); writeFileSync(join(bin, 'git'), `#!${process.execPath}\nsetTimeout(()=>{},30000);\n`, { mode: 0o700 }); process.env.PATH = `${bin}:${previousPath ?? '/usr/bin:/bin'}`;
    daemon = start(runtime); deadline = setTimeout(() => { controller.abort(); stop(runtime); }, 35000);
    await daemon; assert.equal(controller.signal.aborted, false); assert.ok(pulses >= 3); assert.ok(claims >= 1); assert.equal(existsSync(join(runtime, 'jobs', attemptId)), false);
  } finally { clearTimeout(deadline); if (runtime) stop(runtime); await daemon?.catch(() => undefined); if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; await new Promise<void>((done) => server.close(() => done())); rmSync(root, { recursive: true, force: true }); }
});
