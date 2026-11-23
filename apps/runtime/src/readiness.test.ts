/** 多仓库与资料材料实测；只用合成Git/PRD/ERD，真实Repomix内核，不连接模型或远端。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { saveDevice } from './store.js';
import { bindSource } from './source-bindings.js';
import { bindDocuments, documentBinding, unbindDocuments } from './document-bindings.js';
import { checkReadiness } from './readiness.js';
import { configureAgent } from './agent-profile.js';
import { readdirSync, chmodSync } from 'node:fs';
import type { AnalysisSource } from '@c2k/contracts';
/** @param run 合成场景 @returns 测试后清理全部代码和设备目录；失败也回收 */
async function fixture(run: (home: string, sources: AnalysisSource[], root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'c2k-analysis-material-')); const home = join(root, 'device');
  try {
    saveDevice(home, { id: '11111111-1111-1111-1111-111111111111', server: 'http://127.0.0.1:18080', token: 'T'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' }); const sources: AnalysisSource[] = [];
    for (const index of [2, 3]) {
      const repo = join(root, 'repo' + index); mkdirSync(repo); execFileSync('git', ['init', '-q', '-b', 'main', repo]); writeFileSync(join(repo, 'service.ts'), `/** 合成业务服务${index}，不含客户规则。 */\nexport const sample = ${index};`);
      execFileSync('git', ['-C', repo, 'add', '.']); execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', '合成初始提交']);
      const sourceId = String(index).repeat(8) + '-' + String(index).repeat(4) + '-' + String(index).repeat(4) + '-' + String(index).repeat(4) + '-' + String(index).repeat(12); bindSource(home, sourceId, 1, repo); sources.push({ sourceId, revision: 1, alias: 'service-' + index, kind: 'REPOSITORY', branch: 'main', locator: '' });
    }
    const docs = join(root, 'docs'); mkdirSync(docs); mkdirSync(join(docs, 'spec')); writeFileSync(join(docs, 'spec/PRD.md'), '# 合成需求\n只用于能力验收。'); writeFileSync(join(docs, 'spec/ERD.md'), '# 合成ERD\n引用两个合成系统，不代表真实业务。');
    const sourceId = '44444444-4444-4444-4444-444444444444'; bindDocuments(home, sourceId, 1, docs); sources.push({ sourceId, revision: 1, alias: 'design', kind: 'DOCUMENT', branch: '', locator: 'spec' }); await run(home, sources, root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
/** @param sources 合成来源 @returns 固定诊断请求，不含模型配置 */
function request(sources: AnalysisSource[]) { return { id: '66666666-6666-6666-6666-666666666666', state: 'CHECKING' as const, expiresAt: '2099-01-01T00:00:00Z', sources, checks: [] }; }
/** @param home 私有设备根 @param root 合成根 @param version CLI自报版本 @returns 保存只用于--version的假CLI和假凭证，不调用任何模型 */
function profile(home: string, root: string, version = '2.0.1'): void {
  const executable = join(root, 'fake-claude'); writeFileSync(executable, '#!/bin/sh\n[ "$1" = "--version" ] || exit 91\nprintf "' + version + ' (Claude Code)\\n"\n', { mode: 0o700 }); chmodSync(executable, 0o700);
  const secretFile = join(root, 'test-key'); writeFileSync(secretFile, 'isolated-test-value', { mode: 0o600 });
  const config = join(root, 'profile.json'); writeFileSync(config, JSON.stringify({ executable, secretFile, version: '2.0.1', model: 'fixture', endpoint: 'http://127.0.0.1:9' }), { mode: 0o600 }); configureAgent(home, config);
}
test('双仓库及PRD/ERD检查通过但不访问不可达模型端点，输出无本机信息并清理原料', async () => {
  await fixture(async (home, sources, root) => { profile(home, root); const result = await checkReadiness(home, request(sources), new AbortController().signal); assert.equal(result.length, 6); assert.ok(result.every((value) => value.status === 'PASS')); assert.equal(JSON.stringify(result).includes(root), false); assert.equal(JSON.stringify(result).includes('isolated-test-value'), false); assert.equal(readdirSync(home).some((name) => name.startsWith('readiness-')), false); });
});
test('缺少专用模型配置仍诊断原料，不回退个人账号；错误版本、来源许可和缺失分支分别失败', async () => {
  await fixture(async (home, sources) => { const result = await checkReadiness(home, request(sources), new AbortController().signal); assert.equal(result.find((value) => value.code === 'AGENT')?.status, 'FAIL'); assert.equal(result.find((value) => value.code === 'CREDENTIAL')?.status, 'NOT_CHECKED'); assert.equal(result.find((value) => value.code === 'MATERIALS')?.status, 'PASS'); });
  await fixture(async (home, sources, root) => { profile(home, root, '2.0.2'); sources[0]!.revision++; const result = await checkReadiness(home, request(sources), new AbortController().signal); assert.equal(result.find((value) => value.code === 'AGENT')?.status, 'FAIL'); assert.equal(result.find((value) => value.code === 'MATERIALS')?.status, 'FAIL'); });
  await fixture(async (home, sources) => { sources[0]!.branch = 'absent'; const result = await checkReadiness(home, request(sources), new AbortController().signal); assert.equal(result.find((value) => value.code === 'MATERIALS')?.status, 'FAIL'); });
});
test('取消检查回收临时原料，资料被替换不误报就绪', async () => {
  await fixture(async (home, sources) => { const controller = new AbortController(); controller.abort(); await assert.rejects(checkReadiness(home, request(sources), controller.signal)); assert.equal(readdirSync(home).some((name) => name.startsWith('readiness-')), false); });
  await fixture(async (home, sources, root) => { const original = join(root, 'docs/spec/PRD.md'); renameSync(original, original + '.old'); writeFileSync(original, '未授权替换正文'); const result = await checkReadiness(home, request(sources), new AbortController().signal); assert.equal(result.find((value) => value.code === 'MATERIALS')?.status, 'FAIL'); });
});

test('建议诊断500、旧协议和错误响应安全跳过，设备401仍拒绝，不回显正文', async () => {
  const { createServer } = await import('node:http'); const { claimReadiness, ConnectionFailure } = await import('./connection.js');
  let status = 500;
  const server = createServer((_request, response) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ privateData: 'must-not-be-returned' })); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  try { for (status of [500, 404, 403, 409, 200]) assert.equal(await claimReadiness(origin, 'T'.repeat(43)), null); status = 401; await assert.rejects(claimReadiness(origin, 'T'.repeat(43)), (error) => error instanceof ConnectionFailure && error.status === 401 && !error.message.includes('must-not-be-returned')); }
  finally { await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())); }
});
