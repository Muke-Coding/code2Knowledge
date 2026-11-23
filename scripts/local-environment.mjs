/** 本地开发环境公共入口；只创建带项目标签的PostgreSQL容器和私有凭证文件，不接触客户数据库。 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** 当前项目专属容器名称，禁止复用无项目标签的同名容器。 */
export const containerName = 'c2k-platform-local-postgres';
/**
 * 创建缺失的私有本地文件，已有文件保持原值并收紧权限。
 * @param {string} path 仓库.local下路径，不为空。
 * @param {string} content 新文件内容，不为空，禁止输出到控制台。
 * @returns {string} 文件内容，不为空。
 */
function privateFile(path, content) {
  if (!existsSync(path)) writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
  return readFileSync(path, 'utf8').trim();
}
/**
 * 读取或生成本机开发凭证，值仅经进程环境传递，不出现在命令行及日志。
 * @returns {NodeJS.ProcessEnv} 含Java21和数据库配置的子进程环境，不为空。
 */
export function environment() {
  mkdirSync('.local', { recursive: true, mode: 0o700 });
  const db = privateFile('.local/database-password', randomBytes(24).toString('hex'));
  const admin = privateFile('.local/admin-password', randomBytes(18).toString('base64url'));
  privateFile('.local/postgres.env', `POSTGRES_USER=code2knowledge\nPOSTGRES_DB=code2knowledge\nPOSTGRES_PASSWORD=${db}\n`);
  const javaHome = process.env.C2K_JAVA_HOME ?? (existsSync('/Users/muke/Documents/env/java/java21/jdk-21.0.11.jdk/Contents/Home/bin/java') ? '/Users/muke/Documents/env/java/java21/jdk-21.0.11.jdk/Contents/Home' : process.env.JAVA_HOME ?? '');
  if (!existsSync(resolve(javaHome, 'bin/java'))) throw new Error('请设置JAVA_HOME指向JDK21');
  return { ...process.env, C2K_CANDIDATE_NODE: process.execPath, C2K_CANDIDATE_VALIDATOR: resolve('apps/runtime/dist/skill-inspect.js'), JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}`, C2K_DATABASE_URL: 'jdbc:postgresql://127.0.0.1:16432/code2knowledge', C2K_DATABASE_USER: 'code2knowledge', C2K_DATABASE_PASSWORD: db, C2K_BOOTSTRAP_PASSWORD: admin, C2K_TENANT_NAME: process.env.C2K_TENANT_NAME ?? '本地企业' };
}
/**
 * 启动专属数据库；数据卷跨重启保留，不执行清库或自动删除。
 * @returns {Promise<void>} 数据库就绪后完成，无业务返回。
 * @throws {Error} 同名非项目容器、Docker不可用或超时则停止。
 */
export async function database() {
  const env = environment();
  let label;
  try { label = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.code2knowledge.purpose" }}', containerName], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { label = null; }
  if (label === null) execFileSync('docker', ['run', '-d', '--name', containerName, '--label', 'com.code2knowledge.purpose=local-development', '--env-file', resolve('.local/postgres.env'), '-p', '127.0.0.1:16432:5432', '-v', 'c2k-platform-local-data:/var/lib/postgresql/data', 'postgres:17-alpine'], { stdio: 'ignore' });
  else if (label !== 'local-development') throw new Error('同名容器不属于本项目，已停止');
  else execFileSync('docker', ['start', containerName], { stdio: 'ignore' });
  // 轮询只检查连接就绪，不输出容器环境或数据库凭证。
  for (let attempt = 0; attempt < 40; attempt++) {
    try { execFileSync('docker', ['exec', containerName, 'pg_isready', '-U', env.C2K_DATABASE_USER], { stdio: 'ignore' }); return; } catch { await new Promise((done) => setTimeout(done, 500)); }
  }
  throw new Error('本地数据库未在20秒内就绪');
}
