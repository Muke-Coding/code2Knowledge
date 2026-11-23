/** 多仓库/资料本机材料构建；固定提交blob、显式资料inode许可，Repomix离线安全检查，不运行仓库脚本或Git网络。 */
import { spawn } from 'node:child_process';
import { open, mkdir, writeFile, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalysisSource } from '@c2k/contracts';
import { sourceBinding, repositoryRoot } from './source-bindings.js';
import type { SourceBinding } from './source-bindings.js';
import type { DocumentBinding } from './document-bindings.js';
import { documentBinding } from './document-bindings.js';
import { mergeConfigs, pack, setLogLevel } from 'repomix';
/** 父进程解析的单来源许可；子进程只得到明确目录与文件身份，不得到平台Bearer或全设备根。 */
export interface AnalysisPermit {
  /** 平台来源UUID。 */
  sourceId: string;
  /** 代码许可，资料时不存在。 */
  code?: SourceBinding;
  /** 资料许可，代码时不存在。 */
  documents?: DocumentBinding;
}
/** 传给纯Skill模板的来源记录；全部基于本次锁定材料，不取模型自行声明。 */
export interface MaterialSource {
  /** code或document；与Skill2.0一致。 */
  kind: 'code' | 'document';
  /** 仓库名；资料为空。 */
  repository: string;
  /** 代码完整commit或资料原文SHA256。 */
  commit: string;
  /** 资料稳定ID；代码为空。 */
  documentId: string;
  /** 资料根内路径；代码为空。 */
  path: string;
  /** 平台授权来源UUID。 */
  sourceId: string;
  /** 本次来源配置版本。 */
  revision: number;
}
/** 仅在本机私有任务目录存活的材料，不上传完整源码或原始资料。 */
export interface AnalysisMaterials {
  /** 锁定来源与资料指纹，不证明业务结论。 */
  sources: MaterialSource[];
  /** Repomix与资料文本；只向本机专用模型路由发送。 */
  context: string;
  /** 实际纳入代码及资料的文件数。 */
  fileCount: number;
}
/** @param bytes 原始内容 @returns 小写SHA256用于版本追溯，不用于身份授权 */
function hash(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
/**
 * 运行固定本机工具，无shell，不继承Git/SSH/模型/代理凭证；返回值有界，不记录stderr。
 * @param executable 固定工具路径或系统git
 * @param args 固定参数数组，动态值须已通过业务校验
 * @param directory 私有任务根
 * @param limit stdout字节上限
 * @param signal 任务取消/失联信号
 * @returns 有界原始输出，退出非0失败
 * @throws {Error} 超时/超限/取消/工具失败，不含原始输出
 */
export async function localTool(executable: string, args: string[], directory: string, limit: number, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted();
  const child = spawn(executable, args, { env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: directory, TMPDIR: directory, LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_SSH_COMMAND: '/usr/bin/false' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, killSignal: 'SIGKILL', signal });
  const ended = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error('本机工具失败'))); }); void ended.catch(() => undefined);
  const chunks: Buffer[] = []; let length = 0;
  try { for await (const part of child.stdout) { length += part.length; if (length > limit) throw new Error('本机工具输出超限'); chunks.push(Buffer.from(part)); } await ended; return Buffer.concat(chunks); }
  finally { if (child.exitCode === null) child.kill('SIGKILL'); }
}
/** @param repository 明确本机许可仓库 @param directory 私有任务根 @param args 固定只读Git命令 @param limit 输出字节预算 @param signal 取消信号 @returns 禁止所有传输及helper的Git输出 */
async function git(repository: string, directory: string, args: string[], limit: number, signal: AbortSignal): Promise<Buffer> {
  return localTool('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'credential.helper=', '-C', repository, ...args], directory, limit, signal);
}
/**
 * 逐来源锁定材料；代码最多512条、单文本512KiB、全部原文4MiB，最终上下文4MiB，任何超限拒绝而非截断。
 * @param home 本人已配对私有运行时根
 * @param references 平台已校验全部来源，仍须匹配本机许可
 * @param directory 本次新建700任务根
 * @param signal 取消/租约失效信号
 * @param converter 可选固定MarkItDown可执行文件绝对路径；不支持格式或缺失即失败
 * @param permits 可选父进程已解析的最小许可；子执行器必须提供，禁止将真实设备目录传入子进程
 * @returns 完整版本清单与显式材料；二进制代码只记录文件名，不伪称已阅读
 * @throws {Error} 许可/目录/提交/编码/转换/安全扫描/预算失败，不回显原文
 */
export async function buildMaterials(home: string, references: AnalysisSource[], directory: string, signal: AbortSignal, converter?: string, permits?: AnalysisPermit[]): Promise<AnalysisMaterials> {
  if (!references.length || references.length > 16) throw new Error('来源数量不合法');
  const sources: MaterialSource[] = []; const texts: string[] = []; let total = 0; let fileCount = 0;
  for (const reference of references) {
    signal.throwIfAborted(); if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(reference.alias)) throw new Error('材料别名不合法');
    if (reference.kind === 'REPOSITORY') {
      const binding = permits ? permits.find((value) => value.sourceId === reference.sourceId)?.code : sourceBinding(home, reference.sourceId); if (!binding || binding.revision !== reference.revision || repositoryRoot(binding.repository) !== binding.repository) throw new Error('缺少当前代码许可');
      const branch = reference.branch; if (!branch || branch.startsWith('-') || /[\x00-\x20~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{')) throw new Error('分支不合法');
      const commit = (await git(binding.repository, directory, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`], 128, signal)).toString().trim(); if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) throw new Error('提交不合法');
      const entries = (await git(binding.repository, directory, ['ls-tree', '-r', '-z', '--long', commit], 1048576, signal)).toString('utf8').split('\0').filter(Boolean); if (entries.length > 512) throw new Error('代码文件数量超限');
      const root = join(directory, 'materials', 'code', reference.alias); await mkdir(root, { recursive: true, mode: 0o700 });
      const skipped: string[] = [];
      for (const entry of entries) {
        const match = /^(\d+) blob ([a-f0-9]+) +([0-9]+)\t([\s\S]+)$/.exec(entry); if (!match || !['100644', '100755'].includes(match[1] ?? '')) throw new Error('不支持链接或子模块');
        const name = match[4]!; const size = Number(match[3]); if (name.length > 512 || name.split('/').some((part) => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(name) || size > 524288) throw new Error('代码路径或文件超限');
        total += size; if (total > 4194304) throw new Error('全部材料超限');
        const bytes = await git(binding.repository, directory, ['cat-file', 'blob', match[2]!], 524288, signal); if (bytes.length !== size) throw new Error('代码对象长度不符');
        let content: string; try { if (bytes.includes(0)) throw new Error('binary'); content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { skipped.push(name); continue; }
        if (/(^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials|.*\.(?:pem|key|p12|pfx))$/i.test(name)) throw new Error('存在敏感材料文件，需先整理获准范围');
        const target = join(root, name); await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, content, { flag: 'wx', mode: 0o600 }); fileCount++;
      }
      sources.push({ kind: 'code', repository: reference.alias, commit, documentId: '', path: '', sourceId: reference.sourceId, revision: reference.revision });
      texts.push(JSON.stringify({ repository: reference.alias, commit, binaryFilesNotRead: skipped }));
    } else {
      const binding = permits ? permits.find((value) => value.sourceId === reference.sourceId)?.documents : documentBinding(home, reference.sourceId); if (!binding || binding.revision !== reference.revision) throw new Error('缺少当前资料根许可');
      const locator = reference.locator; if (!locator || locator.startsWith('/') || /[\\\x00-\x1f]/.test(locator) || locator.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('资料定位不合法');
      const selected = binding.files.filter((file) => file.path === locator || file.path.startsWith(locator + '/')); if (!selected.length) throw new Error('资料不在显式许可清单');
      for (const file of selected) {
        const handle = await open(join(binding.root, file.path), constants.O_RDONLY | constants.O_NOFOLLOW); let bytes: Buffer;
        try {
          const before = await handle.stat(); if (!before.isFile() || before.dev !== file.device || before.ino !== file.inode || before.uid !== process.getuid?.() || before.size > 8388608) throw new Error('资料身份变化，需重新绑定');
          const input = Buffer.alloc(before.size + 1); let offset = 0; while (offset < input.length) { const part = await handle.read(input, offset, input.length - offset, offset); if (!part.bytesRead) break; offset += part.bytesRead; }
          const after = await handle.stat(); if (offset !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('资料读取期间变化'); bytes = input.subarray(0, offset);
        } finally { await handle.close(); }
        total += bytes.length; if (total > 4194304 || ++fileCount > 640) throw new Error('全部材料超限');
        let content: string;
        if (/\.(?:md|txt|csv|json|ya?ml|xml|sql)$/i.test(file.path)) content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        else {
          if (!converter || !/\.(?:pdf|docx|xlsx|pptx)$/i.test(file.path)) throw new Error('资料格式需本机MarkItDown转换器');
          const input = join(directory, 'document-' + reference.alias + '-' + hash(file.path) + file.path.slice(file.path.lastIndexOf('.'))); await writeFile(input, bytes, { mode: 0o600, flag: 'wx' }); content = new TextDecoder('utf-8', { fatal: true }).decode(await localTool(converter, [input], directory, 524288, signal));
        }
        if (!content.trim() || Buffer.byteLength(content) > 524288) throw new Error('资料为空或转换超限');
        const documentId = reference.alias + '-' + hash(file.path).slice(0, 16); sources.push({ kind: 'document', repository: '', commit: hash(bytes), documentId, path: file.path, sourceId: reference.sourceId, revision: reference.revision }); const documentTarget = join(directory, 'materials', 'documents', reference.alias, documentId + '.md'); await mkdir(dirname(documentTarget), { recursive: true, mode: 0o700 }); await writeFile(documentTarget, content, { mode: 0o600, flag: 'wx' });
        texts.push(JSON.stringify({ document_id: documentId, path: file.path, sha256: hash(bytes), conversion: /\.(?:pdf|docx|xlsx|pptx)$/i.test(file.path) ? 'MarkItDown：不保证扫描图、复杂表格或ERD图片完整保真' : 'UTF-8原文' }));
      }
    }
  }
  if (sources.length > 128) throw new Error('来源文件指纹数量超限');
  // 显式参数合并，不读取仓库/用户Repomix配置，不使用远端、Git diff/log或自定义processor。
  setLogLevel(-1); const output = join(directory, 'repomix.xml');
  const config = mergeConfigs(directory, {}, { output: { filePath: output, style: 'xml', showLineNumbers: true, git: { sortByChanges: false, includeDiffs: false, includeLogs: false } }, input: { maxFileSize: 524288 }, ignore: { useGitignore: false, useDefaultPatterns: false, customPatterns: [] }, security: { enableSecurityCheck: true } });
  const result = await pack([join(directory, 'materials')], config, undefined, undefined, undefined, { signal });
  if (result.suspiciousFilesResults.length || result.skippedFiles.length) throw new Error('Repomix安全检查或完整性检查未通过');
  const packed = await readFile(output); if (packed.length > 4194304) throw new Error('原料超限'); const context = texts.join('\n') + '\n' + packed.toString('utf8'); if (Buffer.byteLength(context) > 4194304) throw new Error('模型上下文超限');
  await writeFile(join(directory, 'material-manifest.json'), JSON.stringify({ sources, fileCount, repomixVersion: '1.19.0', codeBinaryEvidenceNotRead: true }), { mode: 0o600, flag: 'wx' });
  return { sources, context, fileCount };
}
