/** 仅本机就绪诊断；不调用模型，不发送配置、材料正文或底层错误，临时原料无论成功失败均清理。 */
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { kernelCompatibility, readAnalysisGuidelines } from '@code2knowledge/reverse-kernel';
import type { Readiness, ReadinessCheck } from '@c2k/contracts';
import { privateDirectory } from './store.js';
import { readAgentProfile, readLocalSecretFile } from './agent-profile.js';
import { buildMaterials, localTool } from './analysis-materials.js';
import { sourceBinding } from './source-bindings.js';
import { documentBinding } from './document-bindings.js';

/**
 * 在受限临时目录检查固定工具和明确许可原料；通过只代表此刻本机配置就绪，不证明模型连通及语义质量。
 * @param home 已配对的私有设备目录，不回退全局账号
 * @param request 服务端领取的来源快照，不接受命令
 * @param signal 停止、设备失效或调用方取消信号
 * @returns 六项固定状态，不包含路径、端点、模型标识、密钥及日志
 * @throws {Error} 取消或临时目录无法安全建立时不提交成功结果
 */
export async function checkReadiness(home: string, request: Readiness, signal: AbortSignal): Promise<ReadinessCheck[]> {
  const directory = await mkdtemp(join(privateDirectory(home), 'readiness-'));
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const checks: ReadinessCheck[] = [];
  /** @param code 固定检查项 @param status 无自由文本的状态 @returns 追加检查，不输出诊断正文 */
  function add(code: ReadinessCheck['code'], status: ReadinessCheck['status']): void { checks.push({ code, status }); }
  /** @returns 当前许可配置快照，不读取设备凭证或向外返回路径 @throws {Error} 许可文件不合法 */
  function permits(): string { return JSON.stringify(request.sources.map((source) => source.kind === 'REPOSITORY' ? sourceBinding(home, source.sourceId) : documentBinding(home, source.sourceId))); }
  try {
    add('NODE', Number(process.versions.node.split('.')[0]) === 22 ? 'PASS' : 'FAIL');
    try { const version = await localTool('git', ['--version'], directory, 256, bounded); add('GIT', /^git version \d+\./.test(version.toString()) ? 'PASS' : 'FAIL'); } catch { add('GIT', 'FAIL'); }
    try { const guidelines = await readAnalysisGuidelines(); add('SKILL', kernelCompatibility.contractVersion === '2.0' && guidelines.length === 3 && guidelines.every((text) => text.trim().length > 0) ? 'PASS' : 'FAIL'); } catch { add('SKILL', 'FAIL'); }
    let profile: ReturnType<typeof readAgentProfile> = null;
    try { profile = readAgentProfile(home); if (!profile) add('AGENT', 'FAIL'); else { const version = await localTool(profile.executable, ['--version'], directory, 256, bounded); add('AGENT', version.toString().trim() === `${profile.version} (Claude Code)` ? 'PASS' : 'FAIL'); } } catch { add('AGENT', 'FAIL'); }
    try { if (!profile) add('CREDENTIAL', 'NOT_CHECKED'); else { const key = readLocalSecretFile(profile.secretFile).toString('utf8').trim(); add('CREDENTIAL', key && key.length <= 4096 && !/\s/.test(key) ? 'PASS' : 'FAIL'); } } catch { add('CREDENTIAL', 'FAIL'); }
    try { const before = permits(); await buildMaterials(home, request.sources, directory, bounded, profile?.converter); if (before !== permits() || JSON.stringify(profile) !== JSON.stringify(readAgentProfile(home))) throw new Error('配置变化'); add('MATERIALS', 'PASS'); } catch { add('MATERIALS', 'FAIL'); }
    bounded.throwIfAborted(); return checks;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
