/** 共享内核发行边界测试；只用临时Skill身份目录，检查镜像一致性、漂移与链接拒绝，不写个人安装。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syncSkillKernel } from '../scripts/sync-skill-kernel.mjs';
/** @param action 临时Skill目录内测试 @returns 测试结束清理；异常同样清理 */
async function isolated(action) {
  const root = await mkdtemp(join(tmpdir(), 'c2k-mirror-'));
  try { await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@code2knowledge/skill' })); await action(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test('镜像可重现，修改规范后只读门禁拒绝，重新生成恢复', async () => {
  await isolated(async (root) => {
    assert.ok(await syncSkillKernel(root) > 0); await syncSkillKernel(root, true);
    const before = await readFile(join(root, 'kernel-manifest.json'), 'utf8'); await syncSkillKernel(root); assert.equal(await readFile(join(root, 'kernel-manifest.json'), 'utf8'), before);
    await writeFile(join(root, 'references/analysis.md'), '漂移'); await assert.rejects(syncSkillKernel(root, true), /漂移/);
    await syncSkillKernel(root); await syncSkillKernel(root, true);
  });
});
test('错误包身份、未知镜像文件与链接不被静默覆盖', async () => {
  await isolated(async (root) => {
    await writeFile(join(root, 'package.json'), '{"name":"unrelated"}'); await assert.rejects(syncSkillKernel(root), /不是独立Skill/);
    await writeFile(join(root, 'package.json'), '{"name":"@code2knowledge/skill"}'); await syncSkillKernel(root);
    await writeFile(join(root, 'kernel/unmanaged'), '用户文件'); await assert.rejects(syncSkillKernel(root), /未声明/); await rm(join(root, 'kernel/unmanaged'));
    await rm(join(root, 'references/analysis.md')); await symlink(join(root, 'kernel/references/analysis.md'), join(root, 'references/analysis.md')); await assert.rejects(syncSkillKernel(root), /符号链接/);
  });
});
test('平台运行时不依赖Skill入口或其私有模块路径', async () => {
  const pkg = JSON.parse(await readFile(new URL('../apps/runtime/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@code2knowledge/skill'], undefined); assert.equal(pkg.dependencies['@code2knowledge/reverse-kernel'], 'workspace:*');
  for (const file of await readdir(new URL('../apps/runtime/src/', import.meta.url))) {
    if (!file.endsWith('.ts')) continue;
    const body = await readFile(new URL('../apps/runtime/src/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(body, /@code2knowledge\/skill|scripts\/lib\/contract\.mjs/, file);
  }
});
