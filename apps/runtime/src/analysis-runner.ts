/** daemon逆向协调器；设备Bearer留父进程，材料/模型在独立进程组，持续续租并在回传前重查全部本机许可。 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlatform, type AnalysisLease } from '@c2k/contracts';
import type { StoredDevice } from './store.js';
import { privateDirectory } from './store.js';
import { sourceBinding } from './source-bindings.js';
import { documentBinding } from './document-bindings.js';
import { readAgentProfile } from './agent-profile.js';
import type { AnalysisPermit } from './analysis-materials.js';
import { reportTask, serverOrigin } from './connection.js';
import { failedManifest } from './preflight.js';
import { validLease } from './task-runner.js';
/** @param home 私有设备根 @param lease 平台全部固定来源 @returns 本机显式许可；缺任一项立即拒绝 @throws {Error} 来源根或版本未许可 */
function permits(home: string, lease: AnalysisLease): AnalysisPermit[] {
  return lease.sources.map((source) => {
    if (source.kind === 'REPOSITORY') { const code = sourceBinding(home, source.sourceId); if (!code || code.revision !== source.revision) throw new Error('代码许可缺失'); return { sourceId: source.sourceId, code }; }
    const documents = documentBinding(home, source.sourceId); if (!documents || documents.revision !== source.revision) throw new Error('资料许可缺失'); return { sourceId: source.sourceId, documents };
  });
}
/**
 * 执行一次获准逆向；10秒续租、最长20分钟，取消/失联/任一许可变化终止本次POSIX进程组；不自动迁移或切模型。
 * @param home 私有设备根，仅父进程使用
 * @param device 已认证设备，Bearer不写子进程输入/环境
 * @param lease 独立逆向协议已校验租约
 * @param signal daemon停止信号
 * @returns 候选已接受或固定失败终态；旧租约不会回传，原始材料finally删除
 * @throws {Error} 网络失败或本机保护失败；外层只输出安全信息
 */
export async function executeAnalysis(home: string, device: StoredDevice, lease: AnalysisLease, signal: AbortSignal): Promise<void> {
  if (!validLease(lease)) throw new Error('逆向租约不合法'); const identity = { attemptId: lease.attemptId, leaseId: lease.leaseId, fence: lease.fence };
  let allowed: AnalysisPermit[]; const profile = readAgentProfile(home);
  try { allowed = permits(home, lease); if (!profile) throw new Error('无专用模型'); } catch { if (!signal.aborted) await reportTask(device.server, device.token, lease.taskId, { ...identity, ...failedManifest('BINDING_REQUIRED') }, true); return; }
  const jobs = privateDirectory(join(home, 'jobs')); const directory = join(jobs, lease.attemptId); mkdirSync(directory, { mode: 0o700 }); const input = join(directory, 'analysis.json');
  writeFileSync(input, JSON.stringify({ lease, permits: allowed, profile, directory }), { mode: 0o600, flag: 'wx' });
  const child = spawn(process.execPath, [fileURLToPath(new URL('./analysis-worker.js', import.meta.url)), input], { detached: true, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: directory, TMPDIR: directory, LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] });
  let accepted = !signal.aborted, refreshing = false, output = ''; const upload = new AbortController();
  /** @returns 终止本次独立POSIX组并取消上传；不读取存储PID，不向其他设备或任意进程发信号 */
  function terminate(): void { accepted = false; upload.abort(); if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 本次组已退出。 */ } } }
  /** @returns 所有本机许可与配置仍未变化；不把开始时缓存作为永久授权 */
  function permitted(): boolean { try { return JSON.stringify(permits(home, lease)) === JSON.stringify(allowed) && JSON.stringify(readAgentProfile(home)) === JSON.stringify(profile); } catch { return false; } }
  /** @returns 每次续租完成；失败立即关闭新增计算与提交，不离线继续模型任务 */
  async function renew(): Promise<void> { if (refreshing || !accepted) return; refreshing = true; try { if (!permitted()) { terminate(); return; } const ack = await reportTask(device.server, device.token, lease.taskId, identity, false); if (!ack.valid && ack.state !== 'SUCCEEDED') terminate(); } catch { terminate(); } finally { refreshing = false; } }
  signal.addEventListener('abort', terminate, { once: true }); if (signal.aborted) terminate();
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 32) terminate(); }); const interval = setInterval(() => { void renew(); }, 10000); const deadline = setTimeout(terminate, 1200000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    if (!accepted || signal.aborted || !permitted()) return;
    if (code !== 0 || output !== 'READY') { await reportTask(device.server, device.token, lease.taskId, { ...identity, ...failedManifest() }, true); return; }
    if (!(await reportTask(device.server, device.token, lease.taskId, identity, false)).valid || signal.aborted || !permitted()) return;
    const archivePath = join(directory, 'result.zip'), bindingsPath = join(directory, 'bindings.json'); if (statSync(archivePath).size > 8388608 || statSync(bindingsPath).size > 131072) throw new Error('产物超限');
    const archive = readFileSync(archivePath), bindings = readFileSync(bindingsPath, 'utf8');
    const form = new FormData(); form.set('receipt', JSON.stringify({ taskId: lease.taskId, ...identity })); form.set('bindings', bindings); form.set('archive', new Blob([archive]), 'knowledge.zip');
    // 网络失败只重试同attempt和同原包，服务端候选与终态原子提交；取消/撤权/到期拒绝重试旧结果。
    for (let attempt = 0; attempt < 2 && accepted && !signal.aborted; attempt++) {
      try {
        const response = await fetch(serverOrigin(device.server) + '/runtime/v1/analyses/complete', { method: 'POST', redirect: 'error', signal: AbortSignal.any([upload.signal, AbortSignal.timeout(45000)]), headers: { Authorization: `Bearer ${device.token}` }, body: form });
        if (response.status !== 201) { await response.body?.cancel(); throw new Error('回传未接收'); }
        if (!response.body) throw new Error('response'); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 4096) throw new Error('response'); chunks.push(next.value); } } finally { await reader.cancel(); }
        const result = parsePlatform('Candidate', JSON.parse(Buffer.concat(chunks).toString('utf8'))); if (result.mode !== 'EXECUTED') throw new Error('response'); console.log('逆向候选已接收；业务待审核，未发布'); return;
      } catch { if (attempt === 1) throw new Error('逆向回传失败；请在平台检查任务，勿重新导入冒充平台执行'); }
    }
  } catch {
    // 网络不确定时不能覆盖可能已原子成功的结果；服务端以同租约决定是否接受固定失败。
    if (accepted && !signal.aborted && permitted()) { try { await reportTask(device.server, device.token, lease.taskId, { ...identity, ...failedManifest() }, true); } catch { /* 已成功或失联时保留平台事实，不覆盖终态。 */ } }
    throw new Error('逆向执行或回传未确认；请检查平台任务状态');
  } finally { clearInterval(interval); clearTimeout(deadline); signal.removeEventListener('abort', terminate); if (child.exitCode === null) terminate(); rmSync(directory, { recursive: true, force: true }); }
}
