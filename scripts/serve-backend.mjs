/** 本地后端入口；仅经环境取得凭证，Java运行固定Jar快照，后续Maven构建不会改写运行中的类。 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// UI验收指定的Jar已由其调度器隔离；手动服务自行创建私有快照，不接受HTTP请求决定执行路径。
const source = process.env.C2K_BACKEND_JAR ?? 'backend/target/platform-backend-0.1.0-SNAPSHOT.jar';
if (!existsSync(source)) throw new Error('请先构建后端');
const directory = process.env.C2K_BACKEND_JAR ? null : mkdtempSync(join(tmpdir(), 'c2k-backend-'));
const jar = directory ? join(directory, 'platform.jar') : source;
if (directory) { chmodSync(directory, 0o700); copyFileSync(source, jar); chmodSync(jar, 0o600); }
/** @returns 回收本入口拥有的Jar快照；不删除外部调度器的文件，SIGKILL残留不承诺自动清理。 */
function cleanup() { if (directory) rmSync(directory, { recursive: true, force: true }); }
const child = spawn('java', ['-jar', jar, '--spring.profiles.active=platform'], { stdio: 'inherit', env: process.env });
child.once('error', () => { cleanup(); console.error('Java启动失败，请检查JDK21'); process.exitCode = 1; });
child.once('exit', (code) => { cleanup(); process.exitCode = code ?? 1; });
process.once('SIGTERM', () => child.kill('SIGTERM'));
process.once('SIGINT', () => child.kill('SIGTERM'));
