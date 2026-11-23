/** 持久化平台测试入口；每轮创建独立测试库并在完成后删除，不读写手动验收库。 */
import { execFileSync } from 'node:child_process';
import { run } from './process.mjs';
import { randomBytes } from 'node:crypto';
import { database, environment, containerName } from './local-environment.mjs';
await database();
// 测试固定使用隔离本地对象存储，不继承生产shell中的S3接入模式。
const env = { ...environment(), C2K_CANDIDATE_STORAGE: 'local' };
const name = `c2k_test_${randomBytes(6).toString('hex')}`;
execFileSync('docker', ['exec', containerName, 'createdb', '-U', 'code2knowledge', name], { stdio: 'ignore' });
try {
  process.exitCode = await run('mvn', ['-B', '-f', 'backend/pom.xml', '-Pplatform-test', 'verify'], { ...env, C2K_DATABASE_URL: `jdbc:postgresql://127.0.0.1:16432/${name}`, C2K_BOOTSTRAP_PASSWORD: 'Test-Only-Password-2026' });
} finally { execFileSync('docker', ['exec', containerName, 'dropdb', '-U', 'code2knowledge', '--force', name], { stdio: 'ignore' }); }
