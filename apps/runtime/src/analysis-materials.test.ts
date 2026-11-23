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
import { buildMaterials } from './analysis-materials.js';
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
test('两个仓库锁定commit并纳入PRD/ERD原文，工作区未提交内容不进入Repomix', async () => {
  await fixture(async (home, sources, root) => { writeFileSync(join(root, 'repo2/service.ts'), '未提交秘密标记不得出现'); const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 }); const value = await buildMaterials(home, sources, directory, new AbortController().signal);
    assert.equal(value.sources.filter((source) => source.kind === 'code').length, 2); assert.equal(value.sources.filter((source) => source.kind === 'document').length, 2); assert.match(value.context, /合成需求/); assert.match(value.context, /合成ERD/); assert.match(value.context, /code\/service-2\/service.ts/); assert.equal(value.context.includes('未提交秘密标记'), false); assert.equal(value.context.includes(root), false);
  });
});
test('资料文件替换/链接或来源版本变化不能扩大已许可材料读取范围', async () => {
  await fixture(async (home, sources, root) => { const original = join(root, 'docs/spec/PRD.md'); renameSync(original, original + '.old'); writeFileSync(original, '替换后的未获许可文件'); const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 }); await assert.rejects(buildMaterials(home, sources, directory, new AbortController().signal)); });
  await fixture(async (home, sources, root) => { sources[0]!.revision = 2; const directory = join(root, 'job'); mkdirSync(directory, { mode: 0o700 }); await assert.rejects(buildMaterials(home, sources, directory, new AbortController().signal)); });
  await fixture(async (_home, _sources, root) => { symlinkSync(join(root, 'repo2/service.ts'), join(root, 'docs/spec/link.md')); assert.throws(() => bindDocuments(join(root, 'device'), '44444444-4444-4444-4444-444444444444', 1, join(root, 'docs'))); });
});

test('超过8KiB的合法资料许可清单可重复读取和撤销，不放宽设备凭证文件预算', async () => {
  await fixture(async (home, _sources, root) => { const docs = join(root, 'many-docs'); mkdirSync(docs); for (let index = 0; index < 100; index++) writeFileSync(join(docs, 'long-document-name-' + String(index).padStart(3, '0') + '.md'), '合成资料'); const sourceId = '55555555-5555-5555-5555-555555555555'; bindDocuments(home, sourceId, 0, docs); assert.equal(documentBinding(home, sourceId)?.files.length, 100); bindDocuments(home, sourceId, 1, docs); assert.equal(documentBinding(home, sourceId)?.revision, 1); unbindDocuments(home, sourceId); assert.equal(documentBinding(home, sourceId), null); });
});
