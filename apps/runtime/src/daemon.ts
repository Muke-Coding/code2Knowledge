/** 前台常驻心跳进程；不安装OS服务；仅领取显式本机来源许可的预检任务，Git在独立子进程执行。 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { realpathSync } from 'node:fs';
import { executeAnalysis } from './analysis-runner.js';
import { readAgentProfile } from './agent-profile.js';
import { claimAnalysis, claimReadiness, reportReadiness } from './connection.js';
import { checkReadiness } from './readiness.js';
import { executeTask } from './task-runner.js';
import { readDevice, readPrivate, privateDirectory } from './store.js';
import { heartbeat, claimTask, ConnectionFailure } from './connection.js';
/** 本地运行状态，不含凭证或宿主目录列表。 */
export interface RuntimeStatus {
  /** 本地凭证是否存在，不代表服务端仍授权。 */
  configured: boolean;
  /** 本轮心跳进程是否仍存在，不代表网络在线。 */
  running: boolean;
}
/** 运行锁元数据，不含访问凭证。 */
interface ProcessLock {
  /** 当前Node进程号，仅用于活性判断，不用来向任意进程发送终止。 */
  pid: number;
  /** 本次启动随机标识，停止请求必须匹配它。 */
  instance: string;
}
/**
 * 读取运行锁并验证基础格式，不执行文件内容。
 * @param home 私有设备目录，不为空。
 * @returns 锁元数据，不存在返回null。
 * @throws {Error} 锁权限或格式异常时拒绝，不自动删除未知文件。
 */
function lock(home: string): ProcessLock | null {
  const file = join(home, 'running', 'process.json');
  if (!existsSync(file)) return null;
  privateDirectory(join(home, 'running'));
  const value: unknown = JSON.parse(readPrivate(file));
  if (!value || typeof value !== 'object') throw new Error('运行锁不合法');
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid) || candidate.pid <= 0 || typeof candidate.instance !== 'string' || !/^[a-f0-9-]{36}$/.test(candidate.instance)) throw new Error('运行锁不合法');
  return candidate as unknown as ProcessLock;
}
/** @param pid 进程号，正整数。 @returns 进程是否存在；拒绝权限时保守认作存活，不杀其他进程。 */
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } }
/**
 * 本地状态不联网，不让status本身伪造在线心跳。
 * @param home 设备私有目录，不为空。
 * @returns 本地配置和进程活性，不含凭证；平台在线需看平台。
 */
export function status(home: string): RuntimeStatus { privateDirectory(home); const running = lock(home); return { configured: existsSync(join(home, 'device.json')), running: running !== null && alive(running.pid) }; }
/**
 * 请求当前实例停止，不向PID发信号；进程每秒检查请求，网络阻塞最多5秒后可处理。
 * @param home 设备私有目录，不为空。
 * @returns 是否对活动实例提交停止请求，不代表服务端已离线。
 * @throws {Error} 本地文件权限不合法时拒绝。
 */
export function stop(home: string): boolean {
  privateDirectory(home); const current = lock(home); if (!current || !alive(current.pid)) return false;
  const marker = join(home, 'running', `stop-${current.instance}`);
  if (!existsSync(marker)) writeFileSync(marker, '', { mode: 0o600, flag: 'wx' }); return true;
}
/**
 * 使用内核回环端口的独占绑定作为本机进程互斥；崩溃时内核自动释放，避免恢复文件锁的删除竞态。
 * 目录摘要只选择端口，不承载业务或身份；碰撞或端口被其他程序占用时保守拒绝，不自动换端口。
 * @param home 已验证私有目录，不为空，先取真实路径避免同目录别名绕过。
 * @returns 已持有的内核互斥句柄，调用方结束时关闭，不为空。
 * @throws {Error} 另一个实例或其他程序占用同端口时拒绝，不杀原进程。
 */
async function exclusive(home: string): Promise<Server> {
  const port = 20000 + createHash('sha256').update(realpathSync(home)).digest().readUInt32BE(0) % 40000;
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen({ port, host: '127.0.0.1', exclusive: true }, done); });
  return server;
}

/**
 * 启动唯一前台心跳实例；断网有限间隔重试，401/409永久失败退出，SIGINT/SIGTERM清理本次锁。
 * @param home 设备私有目录，不为空。
 * @param once true仅发送一次真实心跳，诊断后退出；false常驻，每10秒一次。
 * @returns 进程处理完成，无业务返回；停止不撤销持久化设备。
 * @throws {Error} 重复启动、凭证失效或本地安全检查失败时拒绝。
 */
export async function start(home: string, once = false): Promise<void> {
  const device = readDevice(home);
  if (Date.parse(device.expiresAt) <= Date.now()) throw new Error('本地设备凭证已过期，请在平台重新配对');
  const directory = join(home, 'running');
  const mutex = await exclusive(home);
  // 内核互斥已取得，旧目录即使空白或PID重用也不会与另一个实例竞争恢复。
  try {
    if (existsSync(directory)) { privateDirectory(directory); rmSync(directory, { recursive: true }); }
    mkdirSync(directory, { mode: 0o700 });
  } catch (error) { mutex.close(); throw error; }
  const current = { pid: process.pid, instance: randomUUID() };
  let quitting = false;
  let taskController: AbortController | null = null;
  /** @returns 标记本次实例停止，等待当前有界请求完成，无业务返回。 */
  function quit(): void { quitting = true; taskController?.abort(); }
  process.once('SIGINT', quit); process.once('SIGTERM', quit);
  let reportedFailure = false;
  let announced = false;
  try {
    writeFileSync(join(directory, 'process.json'), JSON.stringify(current), { mode: 0o600, flag: 'wx' });
    while (!quitting) {
      try {
        const result = await heartbeat(device.server, device.token);
        if (result.id !== device.id) throw new ConnectionFailure(401);
        if (!reportedFailure) { if (!announced) console.log('设备连接已确认；仅执行本机显式许可任务；逆向需专用模型配置'); }
        else console.log('平台连接已恢复');
        reportedFailure = false; announced = true;
        if (!once) {
          const diagnostic = await claimReadiness(device.server, device.token);
          if (diagnostic?.id) {
            const controller = new AbortController(); taskController = controller;
            const pulse = setInterval(() => { void heartbeat(device.server, device.token).catch(() => controller.abort()); }, 10000);
            const stopping = setInterval(() => { if (existsSync(join(directory, `stop-${current.instance}`))) quit(); }, 1000);
            try { const checks = await checkReadiness(home, diagnostic, controller.signal); controller.signal.throwIfAborted(); await reportReadiness(device.server, device.token, diagnostic.id, checks); }
            catch (error) { if (error instanceof ConnectionFailure && [401, 409].includes(error.status)) { if (error.status === 401) throw error; } else if (!controller.signal.aborted && !(error instanceof ConnectionFailure)) console.error('本次就绪检查未完成，请重新检查'); }
            finally { taskController = null; clearInterval(pulse); clearInterval(stopping); }
          }
          if (quitting) break;
          const preflightLease = await claimTask(device.server, device.token);
          const analysisLease = !preflightLease.available && readAgentProfile(home) ? await claimAnalysis(device.server, device.token) : null;
          const lease = analysisLease?.available ? analysisLease : preflightLease;
          if (lease.available) {
            // 心跳独立于重Git子进程；任务续租由协调器处理，设备停止每秒检查并取消进程组。
            const controller = new AbortController(); taskController = controller;
            let pulseFailure: unknown = null;
            const pulse = setInterval(() => { void heartbeat(device.server, device.token).catch((error) => { pulseFailure = error; controller.abort(); }); }, 10000);
            const stopping = setInterval(() => { if (existsSync(join(directory, `stop-${current.instance}`))) quit(); }, 1000);
            try { if (analysisLease?.available) await executeAnalysis(home, device, analysisLease, controller.signal); else await executeTask(home, device, lease, controller.signal); if (pulseFailure) throw pulseFailure; }
            finally { taskController = null; clearInterval(pulse); clearInterval(stopping); }
          }
        }
      } catch (error) {
        if (once || !(error instanceof ConnectionFailure) || [401, 409].includes(error.status)) throw error;
        if (!reportedFailure) console.error('平台暂时不可达；当前任务已停止，连接将重试');
        reportedFailure = true;
      }
      if (once) break;
      for (let second = 0; second < 10 && !quitting; second++) {
        if (existsSync(join(directory, `stop-${current.instance}`))) { quit(); break; }
        await new Promise((done) => setTimeout(done, 1000));
      }
    }
  } finally {
    process.removeListener('SIGINT', quit); process.removeListener('SIGTERM', quit);
    // 仅回收本次独占创建的锁目录，凭证与其他设备目录保留；不按任意PID杀进程。
    try {
      const owned = lock(home);
      if (owned?.instance === current.instance) rmSync(directory, { recursive: true });
    } finally { await new Promise<void>((done, reject) => mutex.close((error) => error ? reject(error) : done())); }
  }
}
