/** daemon任务协调器；设备凭证仅保留父进程，独立子进程只获本次本机许可和分支，无任意平台命令。 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlatform, type PreflightManifest, type TaskLease } from '@c2k/contracts';
import { sourceBinding, isUuid } from './source-bindings.js';
import { privateDirectory, type StoredDevice } from './store.js';
import { failedManifest } from './preflight.js';
import { reportTask } from './connection.js';
/** @param lease 平台契约已解析租约 @returns 是否可作为本地执行标识，不能使用任意路径或空租约 */
export function validLease(lease: TaskLease): boolean { return lease.available && [lease.taskId, lease.attemptId, lease.leaseId, lease.sourceId].every(isUuid) && Number.isSafeInteger(lease.fence) && lease.fence > 0 && Number.isSafeInteger(lease.sourceRevision) && lease.sourceRevision >= 0; }
/**
 * 运行一次隔离预检，10秒续租，失联/取消立即停止本次进程组；最多120秒，不阻塞daemon事件循环。
 * @param home 私有设备目录。
 * @param device 当前设备凭证，仅用于父进程网络请求。
 * @param lease 当前有效租约，不为空。
 * @param signal daemon停止信号，无信号不得传undefined。
 * @returns 工作完成；租约失效不提交，不自动迁移或重试。
 * @throws {Error} 本地安全检查或网络失败时拒绝，外层仅输出固定提示。
 */
export async function executeTask(home: string, device: StoredDevice, lease: TaskLease, signal: AbortSignal): Promise<void> {
  if (!validLease(lease)) throw new Error('执行租约不合法');
  const identity = { attemptId: lease.attemptId, leaseId: lease.leaseId, fence: lease.fence };
  const binding = sourceBinding(home, lease.sourceId);
  if (!binding || binding.revision !== lease.sourceRevision) { if (!signal.aborted) await reportTask(device.server, device.token, lease.taskId, { ...identity, ...failedManifest(binding ? 'SOURCE_CHANGED' : 'BINDING_REQUIRED') }, true); return; }
  const jobs = privateDirectory(join(home, 'jobs')); const directory = join(jobs, lease.attemptId); mkdirSync(directory, { mode: 0o700 });
  const input = join(directory, 'input.json'); writeFileSync(input, JSON.stringify({ repository: binding.repository, branch: lease.branch, directory }), { mode: 0o600, flag: 'wx' });
  const child = spawn(process.execPath, [fileURLToPath(new URL('./preflight-worker.js', import.meta.url)), input], { detached: true, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: directory, TMPDIR: directory, LANG: 'C' }, stdio: ['ignore', 'pipe', 'ignore'] });
  let killed = false; let output = ''; let oversized = false; let refreshing = false; let accepted = !signal.aborted;
  /** @returns 终止本次独立POSIX进程组，不向外部PID发信号；Node本身不构成文件系统沙箱。 */
  function terminate(): void { killed = true; accepted = false; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 已退出时不操作其他进程。 */ } } }
  signal.addEventListener('abort', terminate, { once: true }); if (signal.aborted) terminate();
  // 任意进度正文不回传；子进程输出仅8KiB清单，防止无界内存，stderr不进入日志。
  child.stdout.on('data', (chunk: Buffer) => { if (Buffer.byteLength(output) + chunk.length > 8192) { oversized = true; terminate(); } else output += chunk.toString('utf8'); });
  /** @returns 当前本机许可是否仍匹配本次仓库与配置；撤销/替换不能继续使用开始时的缓存。 */
  function permitted(): boolean { const current = sourceBinding(home, lease.sourceId); return current !== null && current.revision === lease.sourceRevision && current.repository === binding?.repository; }
  /** @returns 当前续租完成；失败关闭执行许可，不能离线继续计算或上传。 */
  async function renew(): Promise<void> {
    if (refreshing || killed) return; refreshing = true;
    try { if (!permitted()) { terminate(); return; } if (!(await reportTask(device.server, device.token, lease.taskId, identity, false)).valid) terminate(); }
    catch { terminate(); }
    finally { refreshing = false; }
  }
  const interval = setInterval(() => { void renew(); }, 10000); const deadline = setTimeout(terminate, 120000);
  try {
    const code = await new Promise<number | null>((done, reject) => { child.once('error', reject); child.once('close', done); });
    clearInterval(interval);
    // 快速任务也需在结果提交前重新续租检查；提交端还将再次检查当前策略与fencing。
    if (!accepted || signal.aborted || killed || !permitted()) return;
    let result: PreflightManifest = failedManifest();
    if (code === 0 && !oversized) { try { result = parsePlatform('PreflightManifest', JSON.parse(output)); } catch { /* 只提交固定失败码，不接受不可信输出。 */ } }
    const renewed = await reportTask(device.server, device.token, lease.taskId, identity, false); if (!renewed.valid || signal.aborted || !accepted) return;
    // 提交失败仅有限重试同一清单，不创建新attempt；平台终态与清单比对保持幂等。
    for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
      try { await reportTask(device.server, device.token, lease.taskId, { ...identity, ...result }, true); return; }
      catch (error) { if (attempt === 1) throw error; }
    }
  } finally {
    clearInterval(interval); clearTimeout(deadline); signal.removeEventListener('abort', terminate);
    if (child.exitCode === null) terminate();
    // 源码隔离归档不持久堆积；结果只存无正文摘要，未来原料缓存另设显式保留策略。
    rmSync(directory, { recursive: true, force: true });
  }
}
