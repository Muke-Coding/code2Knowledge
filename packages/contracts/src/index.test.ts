/** 健康源契约的兼容测试；拒绝伪造就绪、空响应与额外敏感字段。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlatform } from './platform.js';
import { parseHealthResponse, readHealthResponse } from './index.js';

test('有效存活与非就绪状态均按原状态保留', () => {
  assert.deepEqual(parseHealthResponse({ status: 'UP' }), { status: 'UP' });
  assert.equal(parseHealthResponse({ status: 'DOWN' }).status, 'DOWN');
});
test('缺字段、未知状态与额外信息必须拒绝', () => {
  for (const input of [null, {}, { status: 'READY' }, { status: 'UP', secret: 'fixture' }]) {
    assert.throws(() => parseHealthResponse(input), /健康契约/);
  }
});

test('流式响应超过字节上限或非成功状态时拒绝', async () => {
  await assert.rejects(readHealthResponse(new Response('x'.repeat(4097))), /大小限制/);
  await assert.rejects(readHealthResponse(new Response('{}', { status: 503 })), /失败/);
  assert.equal((await readHealthResponse(new Response('{"status":"UP"}'))).status, 'UP');
});

test('平台公开会话拒绝摘要与额外身份字段，成员停用状态按契约保留', async () => {
  const { parsePlatform } = await import('./platform.js');
  const session = { id: 'fixture', username: 'member', displayName: '合成成员', tenantName: '合成企业', role: 'MEMBER', permissions: ['catalog.read'], navigation: [] };
  assert.equal(parsePlatform('Session', session).role, 'MEMBER');
  assert.throws(() => parsePlatform('Session', { ...session, passwordHash: 'forbidden' }), /公开契约/);
  assert.throws(() => parsePlatform('Session', { ...session, role: 'OWNER' }), /公开契约/);
  assert.equal(parsePlatform('Member', { id: 'fixture', username: 'member', displayName: '合成成员', role: 'MEMBER', enabled: false }).enabled, false);
});

test('角色契约拒绝遗漏动作、负版本、重复授权和额外敏感字段', () => {
  const role = { id: 'fixture-role', name: '合成角色', description: '', builtIn: false, revision: 0, permissions: ['catalog.manage'] };
  assert.equal(parsePlatform('Role', role).revision, 0);
  assert.throws(() => parsePlatform('Role', { ...role, revision: -1 }), /公开契约/);
  assert.throws(() => parsePlatform('Role', { ...role, permissions: ['catalog.read', 'catalog.read'] }), /公开契约/);
  assert.throws(() => parsePlatform('MemberRoles', { revision: 0 }), /公开契约/);
  assert.throws(() => parsePlatform('Role', { ...role, passwordHash: 'forbidden' }), /公开契约/);
});

test('候选契约保留导入边界并拒绝额外字段、虚构发布模式和超量资产', () => {
  const candidate = { id: '12345678-1234-1234-1234-123456789abc', digest: 'a'.repeat(64), archiveBytes: 100, createdAt: '2026-11-20T00:00:00Z', mode: 'IMPORTED' };
  assert.equal(parsePlatform('Candidate', candidate).mode, 'IMPORTED');
  assert.throws(() => parsePlatform('Candidate', { ...candidate, ownerToken: 'forbidden' }), /公开契约/);
  assert.throws(() => parsePlatform('Candidate', { ...candidate, mode: 'PUBLISHED' }), /公开契约/);
  assert.throws(() => parsePlatform('CandidatePage', { items: [candidate], page: 1, total: -1 }), /公开契约/);
  const asset = { path: 'domains/overview.md', sha256: 'b'.repeat(64), bytes: 16, meta: { id: 'declared-id', review_status: 'verified' } };
  const report = { version: '1', digest: candidate.digest, mode: 'IMPORTED', skillVersion: '1.0.2', contractVersion: '2.0', assets: [asset] };
  assert.equal(parsePlatform('CandidateReport', report).assets[0]?.meta.review_status, 'verified');
  assert.throws(() => parsePlatform('CandidateReport', { ...report, assets: Array(129).fill(asset) }), /公开契约/);
  assert.throws(() => parsePlatform('CandidateReport', { ...report, assets: [{ ...asset, content: 'forbidden' }] }), /公开契约/);
});

test('逆向租约显式携带全部来源及资料选择，拒绝平台模型或动态命令字段', () => {
  const lease = { available: false, taskId: '', attemptId: '', leaseId: '', fence: 0, sourceId: '', sourceRevision: 0, branch: '', product: '', domain: '', scope: '', documentsChoice: '', sources: [] };
  assert.equal(parsePlatform('AnalysisLease', lease).available, false);
  assert.throws(() => parsePlatform('AnalysisLease', { ...lease, endpoint: 'https://example.invalid' }), /公开契约/);
  assert.throws(() => parsePlatform('AnalysisLease', { ...lease, documentsChoice: 'AUTO' }), /公开契约/);
  assert.throws(() => parsePlatform('AnalysisLease', { ...lease, sources: [{ sourceId: 'fixture', revision: 0, alias: 'core', kind: 'REPOSITORY', branch: 'main', locator: '', command: 'forbidden' }] }), /公开契约/);
});

test('审核契约区分候选决定与发布，拒绝未知状态、敏感字段与正文错误类型', () => {
  const value = { id: '12345678-1234-1234-1234-123456789abc', candidateId: '12345678-1234-1234-1234-123456789abd', digest: 'a'.repeat(64), submitterId: '12345678-1234-1234-1234-123456789abc', reviewerId: '12345678-1234-1234-1234-123456789abc', submitterName: '合成作者', reviewerName: '合成审核人', method: 'SELF', state: 'PENDING', revision: 0, comment: '', createdAt: '2026-11-23T00:00:00Z', decidedAt: '' };
  assert.equal(parsePlatform('Review', value).method, 'SELF');
  assert.throws(() => parsePlatform('Review', { ...value, state: 'PUBLISHED' }), /公开契约/);
  assert.throws(() => parsePlatform('Review', { ...value, sourceToken: 'forbidden' }), /公开契约/);
  assert.throws(() => parsePlatform('Review', { ...value, revision: -1 }), /公开契约/);
  assert.equal(parsePlatform('CandidateContent', { path: 'domains/refund.md', sha256: 'a'.repeat(64), content: '<script>合成文本不得执行</script>' }).content.startsWith('<script>'), true);
  assert.throws(() => parsePlatform('CandidateContent', { path: 'domains/refund.md', sha256: 'a'.repeat(64), content: null }), /公开契约/);
});

test('细分权限前置闭包与取消联动不增加无关管理权', async () => {
  const { permissionPrerequisites, validPermissionSelection, permissionCatalog } = await import('./permissions.js');
  assert.deepEqual(permissionPrerequisites(['device.pair']), ['device.pair', 'device.read']);
  assert.deepEqual(validPermissionSelection(['device.pair']), []);
  assert.deepEqual(permissionPrerequisites(['role.assign']), ['member.read', 'role.assign', 'role.read']);
  const retry = permissionPrerequisites(['analysis.retry']);
  for (const code of ['analysis.read', 'analysis.create', 'source.analyze', 'source.read', 'device.read']) assert(retry.includes(code));
  assert(!permissionPrerequisites(permissionCatalog.baseline).includes('source.analyze'));
  assert(!permissionPrerequisites(['catalog.read.all']).includes('candidate.read'));
});
