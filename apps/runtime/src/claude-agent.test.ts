/** 受控Agent适配测试；使用明确标记的合成CLI进程，不调用真实模型；验证参数、最小环境、纯Skill产物与取消。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeWithClaude } from './claude-agent.js';
import { readSkillBytes } from './skill-adapter.js';
import type { AnalysisLease } from '@c2k/contracts';
/** @param execute 合成场景 @returns 每次独立模型配置和任务目录，失败仍清理；不借用个人Claude设置 */
async function fixture(execute: (root: string, home: string, lease: AnalysisLease) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'c2k-claude-fixture-')); const home = join(root, 'device'); mkdirSync(home, { mode: 0o700 });
  const executable = join(root, 'claude-fixture'); const secret = join(root, 'model.key'); writeFileSync(secret, 'synthetic-model-test-key', { mode: 0o600 });
  // 合成CLI只识别固定调用协议；检查最小环境并模拟结构化模板填充，不代表真实业务逆向。
  writeFileSync(executable, `#!${process.execPath}\nif(process.argv.includes('--version')){console.log('2.1.270 (Claude Code)');process.exit(0)}\nif(!process.argv.includes('--bare')||!process.argv.includes('--restricted')||!process.argv.includes('--no-session-persistence')||process.env.C2K_RUNTIME_HOME||process.env.ANTHROPIC_AUTH_TOKEN||process.env.HTTP_PROXY||process.env.ANTHROPIC_BASE_URL!=='http://127.0.0.1:1')process.exit(2);\nlet prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{if(prompt.includes('WAIT_FOR_CANCEL')){setTimeout(()=>{},60000);return}const start=prompt.indexOf('{"product":');const end=prompt.indexOf('\\nSkill固定规范：');const input=JSON.parse(prompt.slice(start,end));const files=input.templates.map(f=>({...f,content:f.content.replaceAll('需补充','合成分析内容，仅用于适配测试').replaceAll('尚未分析','未做业务真实性验收').replace(/(preconditions|steps|data_changes|async_events|failures|compensation): \\[\\]/g,'$1: [未在合成场景中验证]')}));console.log(JSON.stringify({subtype:'success',is_error:false,structured_output:{files}}));});\n`, { mode: 0o700 });
  writeFileSync(join(home, 'agent.json'), JSON.stringify({ executable, version: '2.1.270', endpoint: 'http://127.0.0.1:1', model: 'synthetic-only', secretFile: secret }), { mode: 0o600 });
  const lease: AnalysisLease = { available: true, taskId: '11111111-1111-1111-1111-111111111111', attemptId: '22222222-2222-2222-2222-222222222222', leaseId: '33333333-3333-3333-3333-333333333333', fence: 1, sourceId: '44444444-4444-4444-4444-444444444444', sourceRevision: 0, branch: 'main', product: 'fixture', domain: 'refund', scope: '合成分析范围', documentsChoice: 'NONE', sources: [{ sourceId: '44444444-4444-4444-4444-444444444444', revision: 0, alias: 'fixture-core', kind: 'REPOSITORY', branch: 'main', locator: '' }] };
  try { await execute(root, home, lease); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('合成CLI只获专用模型key与固定无工具参数，五类产物通过真实Skill内核且保留pending', async () => {
  await fixture(async (root, home, lease) => { const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 }); const result = await analyzeWithClaude(home, lease, { sources: [{ kind: 'code', repository: 'fixture-core', commit: 'a'.repeat(40), documentId: '', path: '', sourceId: lease.sourceId, revision: 0 }], context: '合成源码，不代表客户知识', fileCount: 1 }, directory, new AbortController().signal); const bundle = await readSkillBytes(result.archive); assert.equal(bundle.files.length, 17); assert.equal(result.agentVersion, '2.1.270'); assert.equal(bundle.files.some((file) => file.content.includes('synthetic-model-test-key')), false); assert.match(bundle.files.find((file) => file.path === 'domains/overview.md')!.content, /review_status: pending/); });
});
test('取消中止模型子进程，无本机专用配置不回退个人Claude登录', async () => {
  await fixture(async (root, home, lease) => { const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 }); lease.scope = 'WAIT_FOR_CANCEL'; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 200); try { await assert.rejects(analyzeWithClaude(home, lease, { sources: [], context: '', fileCount: 0 }, directory, controller.signal)); } finally { clearTimeout(timer); } });
  await fixture(async (root, _home, lease) => { const empty = join(root, 'empty'); mkdirSync(empty, { mode: 0o700 }); await assert.rejects(analyzeWithClaude(empty, lease, { sources: [], context: '', fileCount: 0 }, empty, new AbortController().signal)); });
});

test('大量资料重复来源清单超预算时在模型调用前拒绝，不截断来源', async () => {
  await fixture(async (root, home, lease) => {
    const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 });
    const sources: import('./analysis-materials.js').MaterialSource[] = [{ kind: 'code', repository: 'core', commit: 'a'.repeat(40), documentId: '', path: '', sourceId: lease.sourceId, revision: 0 }];
    for (let index = 0; index < 127; index++) sources.push({ kind: 'document', repository: '', commit: 'b'.repeat(64), documentId: 'design-' + index, path: 'spec/' + 'a'.repeat(400) + index + '.md', sourceId: lease.sourceId, revision: 0 });
    // 替身仅允许版本探测，任何模型调用都会留下标记；异常须来自模型前清单预算。
    const marker = join(root, 'model-was-called'); writeFileSync(join(root, 'claude-fixture'), `#!${process.execPath}\nif(process.argv.includes('--version'))console.log('2.1.270 (Claude Code)');else{require('node:fs').writeFileSync(${JSON.stringify(marker)},'called');process.exit(2)}\n`, { mode: 0o700 });
    await assert.rejects(analyzeWithClaude(home, lease, { sources, context: '', fileCount: 128 }, directory, new AbortController().signal), /清单超过128KiB/); const { existsSync } = await import('node:fs'); assert.equal(existsSync(marker), false);
  });
});
