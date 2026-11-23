/** 本地手动验收启动入口；构建后启动专属PostgreSQL、Java与Web，退出只停止本次应用进程，保留数据库。 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { database, environment } from './local-environment.mjs';

/**
 * 启动前检查端口，避免误连其他项目进程；检查和启动之间仍可能被其他进程抢占，子进程失败会整体停止。
 * @param {number} port 计划监听的本地端口，单位端口号。
 * @returns {Promise<void>} 确认当前可监听后完成。
 * @throws {Error} 端口占用或不可监听时拒绝，不终止已有服务。
 */
async function available(port) {
  await new Promise((done, reject) => { const server = createServer(); server.once('error', () => reject(new Error(`端口${port}已占用，请先停止之前的本项目进程`))); server.listen(port, '127.0.0.1', () => server.close(done)); });
}
await available(18080); await available(15173);
const env = environment();
execFileSync('mvn', ['-B', '-f', 'backend/pom.xml', 'verify'], { env, stdio: 'inherit' });
execFileSync('pnpm', ['build'], { env, stdio: 'inherit' });
await database();
const children = [spawn(process.execPath, ['scripts/serve-backend.mjs'], { env, stdio: 'inherit' }), spawn(process.execPath, [resolve('apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: resolve('apps/web'), env, stdio: 'inherit' })];
let stopping = false;
/**
 * 回收本次启动的应用进程，不删除数据库或凭证文件。
 * @returns {void} 发送终止信号，无业务返回。
 */
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); }
for (const child of children) {
  child.once('error', () => { process.exitCode = 1; stop(); });
  child.once('exit', (code) => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);
console.log('本地验收：http://127.0.0.1:15173；登录名admin；初始密码见.local/admin-password（不在日志显示）。Ctrl+C停止应用，数据库保留。');
