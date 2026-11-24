/** 平台依赖边界门禁；只消费已发布内核，不包含Skill私有入口或同名workspace副本。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
test('平台运行时不依赖Skill入口或其私有模块路径', async () => {
  const pkg = JSON.parse(await readFile(new URL('../apps/runtime/package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['@code2knowledge/skill'], undefined); assert.equal(pkg.dependencies['@code2knowledge/kernel'], '0.1.0');
  for (const file of await readdir(new URL('../apps/runtime/src/', import.meta.url))) {
    if (!file.endsWith('.ts')) continue;
    const body = await readFile(new URL('../apps/runtime/src/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(body, /@code2knowledge\/skill|scripts\/lib\/contract\.mjs/, file);
  }
});

test('平台不再包含同名workspace内核，避免掩盖npm依赖', async () => {
  await assert.rejects(access(new URL('../packages/reverse-kernel/', import.meta.url)));
});
