/** 逆向执行子进程；只接收选定许可与本机模型配置，不接收设备Bearer或真实设备目录；原始材料及对话不回传平台。 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildMaterials, type AnalysisPermit } from './analysis-materials.js';
import { analyzeWithClaude } from './claude-agent.js';
import { validateAgentProfile, type AgentProfile } from './agent-profile.js';
import { parsePlatform, type AnalysisLease } from '@c2k/contracts';
import { join } from 'node:path';
/** 父进程明确选取的执行输入，文件0600；没有平台凭证或动态脚本。 */
export interface AnalysisWorkerInput {
  /** 固定逆向业务范围和全部来源，不接受自由工具命令。 */
  lease: AnalysisLease;
  /** 父进程重新解析的本机许可，不自动扩大目录。 */
  permits: AnalysisPermit[];
  /** 本机专用模型设置，密钥仅为明确文件引用。 */
  profile: AgentProfile;
  /** 本次私有任务根，与argv输入同目录。 */
  directory: string;
}
/** @returns 单次多来源材料、Claude及知识校验；失败仅固定退出码，绝不输出原始异常或模型正文 */
async function main(): Promise<void> {
  try {
    if (process.argv.length !== 3 || !process.argv[2]) throw new Error('input');
    // 输入许可清单可超过普通设备小文件8KiB，但仍限制128KiB且由父进程0600创建；只在本次私有目录读取。
    const raw = await readFile(process.argv[2]); if (raw.length > 131072) throw new Error('input'); const input = JSON.parse(raw.toString('utf8')) as AnalysisWorkerInput;
    input.lease = parsePlatform('AnalysisLease', input.lease); input.profile = validateAgentProfile(input.profile);
    if (!input.lease.available || !Array.isArray(input.permits) || input.permits.length !== input.lease.sources.length || typeof input.directory !== 'string') throw new Error('input');
    const signal = AbortSignal.timeout(1200000); const materials = await buildMaterials('', input.lease.sources, input.directory, signal, input.profile.converter, input.permits);
    const result = await analyzeWithClaude('', input.lease, materials, input.directory, signal, input.profile);
    await writeFile(join(input.directory, 'result.zip'), result.archive, { mode: 0o600, flag: 'wx' });
    const bindings = materials.sources.map((value) => ({ sourceId: value.sourceId, revision: value.revision, kind: value.kind, repository: value.kind === 'code' ? value.repository : value.documentId, commit: value.commit, path: value.path }));
    await writeFile(join(input.directory, 'bindings.json'), JSON.stringify(bindings), { mode: 0o600, flag: 'wx' });
    // 仅成功标识，不输出目录、正文或模型用量；父进程仍重新鉴权再上传并等候平台校验。
    process.stdout.write('READY');
  } catch { process.exitCode = 1; }
}
await main();
