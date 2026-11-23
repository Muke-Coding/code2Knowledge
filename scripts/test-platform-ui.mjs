/** 真实浏览器平台验收；创建专属临时数据库，Java/Web进程由Playwright回收，测试后强制删除该临时库。 */
import { execFileSync } from 'node:child_process';
import { run } from './process.mjs';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { database, environment, containerName } from './local-environment.mjs';
await database();
// 测试固定使用隔离本地对象存储，不继承生产shell中的S3接入模式。
const env = { ...environment(), C2K_CANDIDATE_STORAGE: 'local' };
const temporary = mkdtempSync(join(tmpdir(), 'c2k-ui-'));
const objects = join(temporary, 'objects'); const backendJar = join(temporary, 'platform.jar');
const name = `c2k_ui_${randomBytes(6).toString('hex')}`;
execFileSync('docker', ['exec', containerName, 'createdb', '-U', 'code2knowledge', name], { stdio: 'ignore' });
try {
  const build = await run('mvn', ['-B', '-f', 'backend/pom.xml', 'verify'], env);
  // 运行进程使用本轮不可变Jar副本，后续构建不能改写Java尚未懒加载的类。
  if (build === 0) copyFileSync('backend/target/platform-backend-0.1.0-SNAPSHOT.jar', backendJar);
  const types = build === 0 ? await run('pnpm', ['--filter', '@c2k/contracts', 'build'], env) : build;
  const runtime = types === 0 ? await run('pnpm', ['--filter', '@c2k/runtime', 'build'], env) : types;
  process.exitCode = runtime === 0 ? await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.platform.config.ts', ...process.argv.slice(2)], { ...env, C2K_BACKEND_JAR: backendJar, C2K_CANDIDATE_OBJECTS: objects, C2K_DATABASE_URL: `jdbc:postgresql://127.0.0.1:16432/${name}`, C2K_BOOTSTRAP_PASSWORD: 'Test-Only-Password-2026' }) : runtime;
} finally { rmSync(temporary, { recursive: true, force: true }); execFileSync('docker', ['exec', containerName, 'dropdb', '-U', 'code2knowledge', '--force', name], { stdio: 'ignore' }); }
