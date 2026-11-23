/** 真实多来源执行器合成实测；固定CLI替身只验证隔离和协议，不调用模型，不宣称业务逆向成功。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { saveDevice, type StoredDevice } from './store.js';
import { bindSource } from './source-bindings.js';
import { bindDocuments } from './document-bindings.js';
import { executeAnalysis } from './analysis-runner.js';
import type { AnalysisLease } from '@c2k/contracts';
/** @param execute 独立测试场景 @returns 清理设备和全部合成仓库；不写手动验收目录 */
async function fixture(execute: (home: string, root: string, lease: AnalysisLease, device: StoredDevice) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'c2k-analysis-runner-')), home = join(root, 'device');
  const device: StoredDevice = { id: randomUUID(), token: 'synthetic-device-' + 'x'.repeat(26), server: 'http://127.0.0.1:1', expiresAt: '2099-01-01T00:00:00Z' }; saveDevice(home, device);
  const lease: AnalysisLease = { available: true, taskId: randomUUID(), attemptId: randomUUID(), leaseId: randomUUID(), fence: 1, sourceId: randomUUID(), sourceRevision: 0, branch: 'main', product: 'fixture', domain: 'refund', scope: '合成协议验收', documentsChoice: 'INCLUDE', sources: [] };
  for (const alias of ['core', 'payments']) { const repo = join(root, alias); mkdirSync(repo); execFileSync('git', ['init', '-q', '-b', 'main', repo]); writeFileSync(join(repo, 'service.ts'), '/** 合成输入，非客户逻辑。 */\nexport const value = 1;\n'); execFileSync('git', ['-C', repo, 'add', '.']); execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', '合成输入']); const id = randomUUID(); bindSource(home, id, 0, repo); lease.sources.push({ sourceId: id, revision: 0, alias, kind: 'REPOSITORY', branch: 'main', locator: '' }); }
  const docs = join(root, 'docs'); mkdirSync(docs); mkdirSync(join(docs, 'spec')); writeFileSync(join(docs, 'spec/PRD.md'), '# 合成PRD\n仅验证多来源协议'); writeFileSync(join(docs, 'spec/ERD.md'), '# 合成ERD\nEntity → Entity'); const id = randomUUID(); bindDocuments(home, id, 0, docs); lease.sources.push({ sourceId: id, revision: 0, alias: 'design', kind: 'DOCUMENT', branch: '', locator: 'spec' }); lease.sourceId = lease.sources[0]!.sourceId;
  const secret = join(root, 'model.key'); writeFileSync(secret, 'synthetic-dedicated-key', { mode: 0o600 }); const executable = join(root, 'claude-fixture');
  writeFileSync(executable, `#!${process.execPath}\nconst fs=require('node:fs');if(process.argv.includes('--version')){console.log('2.1.270 (Claude Code)');process.exit(0)}if(Object.values(process.env).some(v=>String(v).includes('synthetic-device-'))||process.env.C2K_RUNTIME_HOME||!process.argv.includes('--bare'))process.exit(3);let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(join(root, 'started'))},String(process.pid));if(p.includes('WAIT_FOR_CANCEL')){setTimeout(()=>{},60000);return;}const input=JSON.parse(p.slice(p.indexOf('{"product":'),p.indexOf('\\nSkill固定规范：')));if(input.sourceContext.sources.length!==4||!p.includes('合成PRD')||!p.includes('合成ERD'))process.exit(4);const files=input.templates.map(f=>({...f,content:f.content.replaceAll('需补充','合成结果').replaceAll('尚未分析','未验证业务语义').replace(/(preconditions|steps|data_changes|async_events|failures|compensation): \\[\\]/g,'$1: [合成场景未验证]')}));console.log(JSON.stringify({subtype:'success',is_error:false,structured_output:{files}}));});\n`, { mode: 0o700 });
  writeFileSync(join(home, 'agent.json'), JSON.stringify({ executable, version: '2.1.270', endpoint: 'http://127.0.0.1:1', model: 'synthetic-only', secretFile: secret }), { mode: 0o600 });
  try { await execute(home, root, lease, device); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('双仓库+PRD/ERD经真实Repomix、子进程、Skill校验后仅父进程上传，全来源指纹齐全', async () => {
  await fixture(async (home, _root, lease, device) => {
    let uploaded = false; const server = createServer(async (request, response) => { response.setHeader('Content-Type', 'application/json'); if (request.url?.endsWith('/renew')) { response.end(JSON.stringify({ valid: true, state: 'RUNNING' })); return; } if (request.url === '/runtime/v1/analyses/complete') { const data: Buffer[] = []; for await (const chunk of request) data.push(Buffer.from(chunk)); const body = Buffer.concat(data).toString('utf8'); assert.match(body, /design-/); assert.match(body, /spec\/PRD.md/); assert.match(body, /spec\/ERD.md/); assert.match(body, /payments/); uploaded = true; response.writeHead(201); response.end(JSON.stringify({ id: randomUUID(), digest: 'a'.repeat(64), archiveBytes: 100, createdAt: new Date().toISOString(), mode: 'EXECUTED' })); return; } response.end(JSON.stringify({ valid: true, state: 'FAILED' })); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string'); device.server = `http://127.0.0.1:${address.port}`;
    try { await executeAnalysis(home, device, lease, new AbortController().signal); assert.equal(uploaded, true); assert.equal(existsSync(join(home, 'jobs', lease.attemptId)), false); } finally { await new Promise<void>((done) => server.close(() => done())); }
  });
});
test('取消终止独立执行器及合成Claude进程，不上传候选且删除原料目录', async () => {
  await fixture(async (home, root, lease, device) => { lease.scope = 'WAIT_FOR_CANCEL'; const controller = new AbortController(); const work = executeAnalysis(home, device, lease, controller.signal); for (let count = 0; count < 150 && !existsSync(join(root, 'started')); count++) await new Promise((done) => setTimeout(done, 20)); assert.equal(existsSync(join(root, 'started')), true); const pid = Number(readFileSync(join(root, 'started'), 'utf8')); controller.abort(); await work; assert.throws(() => process.kill(pid, 0)); assert.equal(existsSync(join(home, 'jobs', lease.attemptId)), false); });
});

test('运行中资料许可撤销后续租窗口内终止Claude，不回传旧结果', async () => {
  await fixture(async (home, root, lease, device) => {
    lease.scope = 'WAIT_FOR_CANCEL'; let uploads = 0;
    const server = createServer((_request, response) => { uploads++; response.end(JSON.stringify({ valid: true, state: 'RUNNING' })); }); await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string'); device.server = `http://127.0.0.1:${address.port}`;
    try { const work = executeAnalysis(home, device, lease, new AbortController().signal); for (let count = 0; count < 150 && !existsSync(join(root, 'started')); count++) await new Promise((done) => setTimeout(done, 20)); assert.equal(existsSync(join(root, 'started')), true); const pid = Number(readFileSync(join(root, 'started'), 'utf8')); const source = lease.sources.find((value) => value.kind === 'DOCUMENT')!; rmSync(join(home, 'documents', source.sourceId + '.json')); await work; assert.equal(uploads, 0); assert.throws(() => process.kill(pid, 0)); assert.equal(existsSync(join(home, 'jobs', lease.attemptId)), false); } finally { await new Promise<void>((done) => server.close(() => done())); }
  });
});
