/** 固定Skill1.0.2纯契约适配；只读取显式ZIP知识包，不加载prepare/export、全局配置、通知或模型。 */
import { dirname, join } from 'node:path';
import { open, readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { validateContract, kernelCompatibility } from '@code2knowledge/kernel';
/** 单个原始资产；保留UTF-8正文与相对定位，摘要按原始字节计算。 */
export interface KnowledgeFile {
  /** 五类目录下相对路径，不包含本机绝对定位。 */
  path: string;
  /** 原始UTF-8内容；不进行自动修复或审核状态升级。 */
  content: string;
  /** 原始文件字节SHA-256。 */
  sha256: string;
}
/** 仅用于候选接收的Skill资产快照，不包含平台权限或发布决定。 */
export interface SkillBundle {
  /** 平台封套版本，与Skill知识契约独立。 */
  version: '1';
  /** 固定生产方式，不冒充平台执行。 */
  mode: 'IMPORTED';
  /** 本轮支持的Skill包精确版本。 */
  skillVersion: '1.0.2';
  /** 原资产知识契约版本。 */
  contractVersion: '2.0';
  /** 所有文件按相对路径排序的摘要，不包含请求或本机路径。 */
  digest: string;
  /** 原始五类资产，不静默忽略未知文件。 */
  files: KnowledgeFile[];
}
/** 五类目录固定白名单；未知根文件不属于导出资产，读取时拒绝而非悄悄丢失。 */
const directories = ['domains', 'graph', 'mappings', 'ontology', 'rules'];
/** @param bytes 原始字节或确定性文本 @returns 小写SHA-256，不用于身份授权 */
function hash(bytes: Buffer | string): string { return createHash('sha256').update(bytes).digest('hex'); }
/**
 * 读取单个明确选择的ZIP，避免目录遍历期间祖先路径替换导致读取范围扩大；不在原路径解压。
 * @param archive 用户选择的ZIP普通文件，最终节点不跟随符号链接；最多8MiB。
 * @returns 不可变原始资产封套，128文件/256条目/512KiB单文件/4MiB正文；校验不代表业务正确。
 * @throws {Error} ZIP、路径、限额、编码或Skill契约不符时固定拒绝。
 */
export async function readSkillBundle(archive: string): Promise<SkillBundle> {
  try {
    const handle = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW); let input: Buffer;
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 8388608) throw new Error('archive');
      input = Buffer.alloc(stat.size + 1); let offset = 0;
      while (offset < input.length) { const value = await handle.read(input, offset, input.length - offset, offset); if (!value.bytesRead) break; offset += value.bytesRead; }
      if (offset !== stat.size) throw new Error('changed'); input = input.subarray(0, offset);
    } finally { await handle.close(); }
    return await readSkillBytes(input);
  } catch { throw new Error('Skill导出包不符合1.0.2/2.0契约或安全限额；未执行模型、同步来源或发送通知'); }
}
/**
 * 对内存中同一份ZIP快照校验，调用方上传时复用这些字节，避免校验后重开路径。
 * @param input 最多8MiB的明确选择文件快照，不允许修改期间并发使用
 * @returns 五类原始资产与确定性摘要，不授予来源权限
 * @throws {Error} 路径、大小、编码或纯Skill契约不符合时拒绝
 */
export async function readSkillBytes(input: Buffer): Promise<SkillBundle> {
  try {
    if (input.length > 8388608) throw new Error('archive');
    const zip = await new Promise<ZipFile>((done, reject) => fromBuffer(input, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, file) => error || !file ? reject(new Error('zip')) : done(file)));
    const files: KnowledgeFile[] = []; let bytes = 0; let entries = 0; const seen = new Set<string>();
    try {
      await new Promise<void>((done, reject) => {
        zip.once('error', reject); zip.once('end', done);
        zip.on('entry', (entry: Entry) => { void consume(entry).then(() => zip.readEntry(), reject); });
        /** @param entry ZIP声明条目，尚不可信 @returns 严格检查后有界读取，不提取链接或执行内容 */
        async function consume(entry: Entry): Promise<void> {
          const name = entry.fileName; const directory = name.endsWith('/'); const relative = directory ? name.slice(0, -1) : name;
          const parts = relative.split('/'); const mode = entry.externalFileAttributes >>> 16; const type = mode & 0o170000;
          if (++entries > 256 || seen.has(relative) || relative.length > 512 || parts.length > 8 || parts.some((part) => !part || part === '.' || part === '..') || !directories.includes(parts[0] ?? '') || name !== name.normalize('NFC') || /[\\\x00-\x1f]/.test(name) || (entry.generalPurposeBitFlag & 1) || (type && type !== (directory ? 0o040000 : 0o100000))) throw new Error('entry');
          seen.add(relative);
          if (directory) { if (entry.uncompressedSize !== 0) throw new Error('directory'); return; }
          if (!/\.(md|ya?ml)$/i.test(name) || files.length >= 128 || entry.uncompressedSize > 524288 || bytes + entry.uncompressedSize > 4194304) throw new Error('size');
          const stream = await new Promise<import('node:stream').Readable>((resolve, fail) => zip.openReadStream(entry, (error, value) => error || !value ? fail(new Error('stream')) : resolve(value)));
          const chunks: Buffer[] = []; let count = 0;
          for await (const value of stream) { const chunk = Buffer.from(value); count += chunk.length; if (count > 524288 || bytes + count > 4194304) { stream.destroy(); throw new Error('limit'); } chunks.push(chunk); }
          if (count !== entry.uncompressedSize) throw new Error('length');
          const buffer = Buffer.concat(chunks); const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
          bytes += count; files.push({ path: name, content, sha256: hash(buffer) });
        }
        zip.readEntry();
      });
    } finally { zip.close(); }
    if (!directories.every((dir) => files.some((file) => file.path.startsWith(dir + '/')))) throw new Error('missing');
    if (kernelCompatibility.contractVersion !== '2.0' || kernelCompatibility.legacySkillVersion !== '1.0.2') throw new Error('version');
    // 只校验已读取的不可变暂存副本，避免原目录在摘要读取与语义校验之间变化造成混合版本。
    const snapshot = await mkdtemp(join(tmpdir(), 'c2k-skill-validation-'));
    try {
      for (const file of files) { await mkdir(dirname(join(snapshot, file.path)), { recursive: true, mode: 0o700 }); await writeFile(join(snapshot, file.path), file.content, { mode: 0o600, flag: 'wx' }); }
      const validation = await validateContract(snapshot); if (validation.errors.length) throw new Error('contract');
    } finally { await rm(snapshot, { recursive: true, force: true }); }
    files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    return { version: '1', mode: 'IMPORTED', skillVersion: '1.0.2', contractVersion: '2.0', digest: hash(files.map((file) => `${file.path}:${file.sha256}`).join('\n')), files };
  } catch { throw new Error('Skill导出包不符合1.0.2/2.0契约或安全限额；未执行模型、同步来源或发送通知'); }
}
