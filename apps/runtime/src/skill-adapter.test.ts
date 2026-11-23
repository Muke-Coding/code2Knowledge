/** 固定Skill产物适配真实内核测试；全部使用合成资产，不运行prepare/export，不访问模型、Git或通知。 */
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, symlink, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readSkillBundle } from './skill-adapter.js';
/** 合成黄金包路径；commit为虚构常量，不表示真实核验源码。 */
const fixture = fileURLToPath(new URL('../../../verification/fixtures/skill-2.0/', import.meta.url));
/** @param mutate 本次隔离资产修改，不为空 @returns 完成后删除临时目录，任何失败均清理 */
async function withFixture(mutate: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'c2k-skill-test-'));
  try { await cp(fixture, root, { recursive: true }); await mutate(root); } finally { await rm(root, { recursive: true, force: true }); }
}
/** @param root 合成资产根 @returns 用系统zip创建显式输入文件后校验；-y保留恶意链接供读取器拒绝 */
async function readFixture(root: string) {
  const temp = await mkdtemp(join(tmpdir(), 'c2k-archive-'));
  try { const archive = join(temp, 'bundle.zip'); execFileSync('/usr/bin/zip', ['-q', '-r', '-y', archive, '.'], { cwd: root }); return await readSkillBundle(archive); }
  finally { await rm(temp, { recursive: true, force: true }); }
}
test('真实固定契约内核接收五类资产，保留原文与稳定标识，确定性摘要不含本机路径', async () => {
  await withFixture(async (root) => {
    const first = await readFixture(root); const second = await readFixture(root);
    assert.equal(first.skillVersion, '1.0.2'); assert.equal(first.mode, 'IMPORTED'); assert.equal(first.digest, second.digest);
    assert.equal(first.files.length, 13); assert.equal(first.files.some((file) => file.path.startsWith('graph/')), true);
    for (const file of first.files) { assert.equal(file.content, await readFile(join(root, file.path), 'utf8')); assert.equal(file.sha256, createHash('sha256').update(file.content).digest('hex')); }
    assert.equal(JSON.stringify(first).includes(root), false);
  });
});
test('损坏的稳定引用或缺失五类目录拒绝，不用模板自动补齐', async () => {
  await withFixture(async (root) => { const file = join(root, 'domains/overview.md'); await writeFile(file, (await readFile(file, 'utf8')).replaceAll('CAP:refund:refund', 'CAP:refund:missing')); await assert.rejects(readFixture(root)); });
  await withFixture(async (root) => { await rm(join(root, 'mappings'), { recursive: true }); await assert.rejects(readFixture(root)); });
});
test('链接、未知文件和超限资产拒绝，不读取额外材料', async () => {
  await withFixture(async (root) => { await symlink(join(root, 'domains/overview.md'), join(root, 'domains/link.md')); await assert.rejects(readFixture(root)); });
  await withFixture(async (root) => { await writeFile(join(root, 'repomix-output.xml'), '禁止作为知识包回传'); await assert.rejects(readFixture(root)); });
  await withFixture(async (root) => { await writeFile(join(root, 'domains/oversize.md'), Buffer.alloc(524289)); await assert.rejects(readFixture(root)); });
});

test('总目录条目预算包含空目录，宽目录树不能绕过文件数量限额', async () => {
  await withFixture(async (root) => { for (let index = 0; index < 257; index++) await mkdir(join(root, 'domains', `empty-${index}`)); await assert.rejects(readFixture(root)); });
});

test('ZIP内路径穿越与无效UTF-8拒绝，不将其规范化成可信资产', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'c2k-malformed-zip-'));
  try {
    const archive = join(temp, 'bundle.zip'); execFileSync('/usr/bin/zip', ['-q', '-r', '-0', archive, '.'], { cwd: fixture });
    const original = await readFile(archive); const escaped = Buffer.from(original); const needle = Buffer.from('domains/'); const replacement = Buffer.from('../evil/'); let offset = 0;
    while ((offset = escaped.indexOf(needle, offset)) >= 0) { replacement.copy(escaped, offset); offset += needle.length; }
    await writeFile(archive, escaped); await assert.rejects(readSkillBundle(archive));
    const invalid = Buffer.from(original); const content = invalid.indexOf(Buffer.from('knowledge_id:')); assert.ok(content > 0); invalid[content] = 0xff;
    await writeFile(archive, invalid); await assert.rejects(readSkillBundle(archive));
  } finally { await rm(temp, { recursive: true, force: true }); }
});


test('资产相对路径不得超出平台报告契约512字符，防止导入成功后详情无法读取', async () => {
  await withFixture(async (root) => {
    const directory = join(root, 'domains', 'a'.repeat(200), 'b'.repeat(200)); await mkdir(directory, { recursive: true });
    await rename(join(root, 'domains/overview.md'), join(directory, 'c'.repeat(180) + '.md')); await assert.rejects(readFixture(root));
  });
});
