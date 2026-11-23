/** 每任务只读Git预检；不执行仓库脚本、hooks、网络或模型，仅把指定本地分支固定commit后生成有界隔离tar并摘要。 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream, lstatSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { PreflightManifest } from '@c2k/contracts';
import { repositoryRoot } from './source-bindings.js';
import { privateDirectory } from './store.js';
/** 固定执行上限；256MiB归档和10万条目，超出失败而不是截断清单。 */
export const preflightLimits = { archiveBytes: 268435456, entries: 100000, commandMs: 30000 } as const;
/** @param code 固定失败码，默认预检失败 @returns 无正文失败清单 */
export function failedManifest(code: 'BINDING_REQUIRED' | 'SOURCE_CHANGED' | 'PREFLIGHT_FAILED' = 'PREFLIGHT_FAILED'): PreflightManifest { return { outcome: 'FAILED', commitId: '', archiveSha256: '', fileCount: 0, archiveBytes: 0, failureCode: code }; }
/**
 * 使用允许环境与参数数组启动Git，不继承SSH/模型凭证和全局配置；无shell或checkout；强制拒绝所有传输和lazy fetch，清空仓库凭证helper，缺对象直接失败。
 * @param repository 已验证独立仓库真实根。
 * @param directory 本次私有隔离根，用作HOME/TMPDIR。
 * @param args 固定Git子命令及已验证分支/commit参数。
 * @returns Git子进程；调用方必须处理退出、限流及输出。
 */
function git(repository: string, directory: string, args: string[]) {
  return spawn('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'credential.helper=', '-c', 'core.askPass=/usr/bin/false', '-C', repository, ...args], { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: directory, TMPDIR: directory, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_SSH_COMMAND: '/usr/bin/false' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: preflightLimits.commandMs, killSignal: 'SIGKILL' });
}
/** @param repository 真实仓库根 @param directory 本次隔离根 @param args 固定Git命令 @returns 最大2MiB的本机输出，不回传正文 @throws {Error} Git失败或超时时拒绝 */
async function capture(repository: string, directory: string, args: string[]): Promise<string> {
  const child = git(repository, directory, args); const chunks: Buffer[] = []; let bytes = 0;
  const exit = new Promise<void>((done, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? done() : reject(new Error('Git预检失败'))); });
  // 先挂拒绝观察者，流读取期间进程失败也不产生未处理拒绝；最终仍等待原Promise传播失败。
  void exit.catch(() => undefined);
  try { for await (const chunk of child.stdout) { bytes += chunk.length; if (bytes > 2097152) throw new Error('Git清单超限'); chunks.push(Buffer.from(chunk)); } await exit; return Buffer.concat(chunks).toString('utf8'); }
  finally { if (child.exitCode === null) child.kill('SIGKILL'); }
}
/**
 * 固定本地分支生成不解包的tar；脏工作区与未跟踪文件不进入快照，submodule拒绝以免漏依赖。
 * @param repository 所有者显式许可仓库根，不为空。
 * @param branch 明确的本地分支名，不能传任意revision或参数。
 * @param directory 本次独占私有目录，归档执行后由父进程删除。
 * @returns 不含源码、文件名或路径的清单；失败仅固定码。
 * @throws {Error} 无效仓库/分支、超时、归档超限或Git失败时拒绝。
 */
export async function preflight(repository: string, branch: string, directory: string): Promise<PreflightManifest> {
  privateDirectory(directory);
  if (lstatSync(repository).isSymbolicLink() || repositoryRoot(repository) !== repository) throw new Error('仓库绑定已改变');
  if (!branch || branch.length > 200 || branch.startsWith('-') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.') || branch.includes('..') || branch.includes('@{') || /[\s\x00-\x1f~^:?*\[\\]/.test(branch) || branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new Error('分支不合法');
  const commitId = (await capture(repository, directory, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`])).trim();
  if (!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(commitId)) throw new Error('Git对象不合法');
  const modes = (await capture(repository, directory, ['ls-tree', '-r', '--format=%(objectmode)', commitId])).trim().split('\n').filter(Boolean);
  if (modes.length > preflightLimits.entries || modes.some((mode) => !['100644', '100755', '120000'].includes(mode))) throw new Error('提交包含未支持依赖或规模超限');
  const file = join(directory, 'source.tar'); const child = git(repository, directory, ['archive', '--format=tar', commitId]);
  const exit = new Promise<void>((done, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? done() : reject(new Error('隔离归档失败'))); }); void exit.catch(() => undefined);
  let archiveBytes = 0;
  // 在写入前限制字节数，不能把超大归档先写满磁盘再校验；tar只保存在本次私有目录，不解包执行。
  const bound = new Transform({
    /** @param chunk 本次归档字节块 @param _encoding 流编码，二进制忽略 @param done 流回调，超限返回错误 @returns 通知流继续或拒绝，不积累正文 */
    transform(chunk: Buffer, _encoding, done) { archiveBytes += chunk.length; done(archiveBytes > preflightLimits.archiveBytes ? new Error('归档超限') : null, chunk); } });
  try { await pipeline(child.stdout, bound, createWriteStream(file, { flags: 'wx', mode: 0o600 })); await exit; }
  finally { if (child.exitCode === null) child.kill('SIGKILL'); }
  chmodSync(file, 0o600); const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { outcome: 'SUCCEEDED', commitId, archiveSha256: hash.digest('hex'), fileCount: modes.length, archiveBytes, failureCode: '' };
}
