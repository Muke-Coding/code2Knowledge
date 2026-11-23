/** 本机模型配置边界测试；不读取真实凭证、不连接模型、不修改个人Claude目录。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureAgent, readAgentProfile, readLocalSecretFile, validateAgentProfile } from './agent-profile.js';
test('配置仅显式保存到本机；无配置不继承个人账号，宽权限/链接/超限拒绝', () => {
  const root = mkdtempSync(join(tmpdir(), 'c2k-agent-profile-'));
  try {
    const home = join(root, 'device'); assert.equal(readAgentProfile(home), null);
    const file = join(root, 'config.json'); const value = { executable: '/opt/claude', version: '2.1.270', endpoint: 'https://model.example.invalid/anthropic', model: 'enterprise-claude', secretFile: join(root, 'model.key') };
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); configureAgent(home, file); assert.deepEqual(readAgentProfile(home), value);
    chmodSync(file, 0o644); assert.throws(() => configureAgent(home, file)); assert.deepEqual(readAgentProfile(home), value); chmodSync(file, 0o600);
    const link = join(root, 'link'); symlinkSync(file, link); assert.throws(() => readLocalSecretFile(link)); writeFileSync(file, Buffer.alloc(8193)); assert.throws(() => readLocalSecretFile(file));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('拒绝内嵌凭证/明文远程/额外命令配置，不将局部模型选择当企业外发授权', () => {
  const value = { executable: '/opt/claude', version: '2.1.270', endpoint: 'https://model.example.invalid', model: 'enterprise-claude', secretFile: '/private/model.key' };
  for (const endpoint of ['http://model.example.invalid', 'https://u:p@example.invalid', 'https://example.invalid?key=value', 'https://example.invalid#value', 'file:///tmp/model']) assert.throws(() => validateAgentProfile({ ...value, endpoint }));
  assert.throws(() => validateAgentProfile({ ...value, executable: 'claude --dangerously-skip-permissions' })); assert.throws(() => validateAgentProfile({ ...value, extra: 'command' }));
  assert.equal(validateAgentProfile({ ...value, endpoint: 'http://127.0.0.1:1234' }).endpoint, 'http://127.0.0.1:1234');
});
