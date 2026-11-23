/** 资料来源的显式本机根许可；平台只下发根内相对定位，不接受平台任意绝对路径或继承仓库许可。 */
import { lstatSync, realpathSync, writeFileSync, renameSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readDevice, privateDirectory } from './store.js';
import { readLocalSecretFile } from './agent-profile.js';
import { isUuid } from './source-bindings.js';
/** 本设备一个资料来源的受限真实根；不回传平台。 */
export interface DocumentBinding {
  /** 配对平台origin。 */
  server: string;
  /** 配对设备UUID。 */
  deviceId: string;
  /** 平台资料来源UUID。 */
  sourceId: string;
  /** 显式同意的配置版本。 */
  revision: number;
  /** 本人资料真实根目录，不是单个文件或网络URL。 */
  root: string;
  /** 明确许可时的普通文件身份清单；读取必须匹配inode/device，路径替换不能扩大授权范围。 */
  files: DocumentFilePermit[];
}
/** 显式资料许可的单文件身份，不含正文。 */
export interface DocumentFilePermit {
  /** 根内规范相对路径。 */
  path: string;
  /** POSIX设备号，结合inode识别明确选择的文件。 */
  device: number;
  /** POSIX文件号，替换文件后必须重新绑定。 */
  inode: number;
}
/** @param home 已配对私有运行时根 @param sourceId 平台资料UUID @param revision 当前版本 @param path 本机根目录 @returns 保存完成，不访问平台或转换资料 @throws {Error} 身份/字段/目录不合法 */
export function bindDocuments(home: string, sourceId: string, revision: number, path: string): void {
  if (!isUuid(sourceId) || !Number.isSafeInteger(revision) || revision < 0 || lstatSync(path).isSymbolicLink()) throw new Error('资料许可输入错误');
  const root = realpathSync(path); const stat = lstatSync(root); if (!stat.isDirectory() || stat.uid !== process.getuid?.()) throw new Error('资料根须为本人普通目录');
  const files: DocumentFilePermit[] = []; let entries = 0;
  /** @param relative 根内相对目录 @returns 只登记文件身份，不读取正文；256条目/8层预算防止无界遍历 */
  function inventory(relative: string): void {
    if (relative.split('/').length > 8) throw new Error('资料目录过深');
    for (const name of readdirSync(join(root, relative))) {
      if (++entries > 256 || /[\\\x00-\x1f]/.test(name)) throw new Error('资料条目超限');
      const path = relative ? relative + '/' + name : name; const entry = lstatSync(join(root, path));
      if (entry.isSymbolicLink()) throw new Error('资料根不允许链接');
      if (entry.isDirectory()) inventory(path); else if (entry.isFile() && entry.uid === process.getuid?.()) files.push({ path, device: entry.dev, inode: entry.ino }); else throw new Error('资料包含特殊节点');
    }
  }
  inventory(''); if (!files.length || files.length > 128) throw new Error('资料文件数量不合法');
  const device = readDevice(home); const directory = privateDirectory(join(home, 'documents')); const target = join(directory, sourceId + '.json'); if (existsSync(target)) readLocalSecretFile(target, 131072);
  const temporary = join(directory, randomUUID() + '.tmp'); writeFileSync(temporary, JSON.stringify({ server: device.server, deviceId: device.id, sourceId, revision, root, files }), { mode: 0o600, flag: 'wx' }); renameSync(temporary, target);
}
/** @param home 已配对私有运行时根 @param sourceId 平台资料UUID @returns 当前有效根许可；缺失null，不继承代码许可 @throws {Error} 格式/身份/权限不符 */
export function documentBinding(home: string, sourceId: string): DocumentBinding | null {
  if (!isUuid(sourceId)) throw new Error('资料UUID不合法'); const device = readDevice(home); const file = join(privateDirectory(join(home, 'documents')), sourceId + '.json'); if (!existsSync(file)) return null;
  const value = JSON.parse(readLocalSecretFile(file, 131072).toString('utf8')) as DocumentBinding;
  if (!value || Object.keys(value).sort().join() !== 'deviceId,files,revision,root,server,sourceId' || value.deviceId !== device.id || value.server !== device.server || value.sourceId !== sourceId || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.root !== 'string' || !Array.isArray(value.files) || value.files.length > 128 || value.files.some((item) => !item || typeof item.path !== 'string' || !item.path || item.path.length > 512 || item.path.split('/').some((part) => !part || part === '.' || part === '..') || /[\\\x00-\x1f]/.test(item.path) || !Number.isSafeInteger(item.device) || !Number.isSafeInteger(item.inode))) throw new Error('资料许可不匹配'); return value;
}

/** @param home 已配对设备私有根 @param sourceId 平台资料UUID @returns 仅撤销该资料许可，不删除原始资料 @throws {Error} 非法UUID或设备身份不符 */
export function unbindDocuments(home: string, sourceId: string): void {
  const current = documentBinding(home, sourceId); if (current) unlinkSync(join(home, 'documents', sourceId + '.json'));
}
