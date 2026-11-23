/** 设备所有者显式来源许可；本地路径只存私有文件，不通过平台下发路径、继承Git凭证或自动联网。 */
import { lstatSync, realpathSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readDevice, privateDirectory, readPrivate } from './store.js';
/** 一个设备与来源配置版本的本机只读仓库绑定。 */
export interface SourceBinding {
  /** 已配对平台origin，切换平台不复用绑定。 */
  server: string;
  /** 已配对设备UUID，不能复制到其他设备自动取得许可。 */
  deviceId: string;
  /** 平台来源UUID，不是文件路径。 */
  sourceId: string;
  /** 已确认来源配置版本，后续变化需重新绑定。 */
  revision: number;
  /** 规范真实本机仓库根，仅本机保存，禁止日志或回传。 */
  repository: string;
}
/** @param value 来源或任务UUID @returns 是否可安全用作固定私有目录文件名 */
export function isUuid(value: string): boolean { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value); }
/**
 * 校验普通独立仓库；本轮拒绝worktree/gitdir文件、链接.git和裸仓库，不自动改开发工作区。
 * @param path 用户明确选择的本机仓库根，不为空。
 * @returns 已解析真实根目录，不能作为外部结果输出。
 * @throws {Error} 目录或.git边界不满足时拒绝。
 */
export function repositoryRoot(path: string): string {
  const root = realpathSync(path); const directory = lstatSync(root); const git = lstatSync(join(root, '.git'));
  if (!directory.isDirectory() || directory.isSymbolicLink() || !git.isDirectory() || git.isSymbolicLink() || directory.uid !== process.getuid?.()) throw new Error('仅支持当前用户普通本机仓库');
  return root;
}
/**
 * 显式新增或替换单个来源许可；先验证真实仓库再原子替换私有文件，不联网验证平台范围。
 * @param home 已配对设备私有根。
 * @param sourceId 平台来源UUID。
 * @param revision 用户确认配置版本，非负整数。
 * @param path 本机仓库根，不能是Git URL。
 * @returns 保存完成，路径不输出。
 * @throws {Error} 身份、字段或文件权限不合法时拒绝。
 */
export function bindSource(home: string, sourceId: string, revision: number, path: string): void {
  if (!isUuid(sourceId) || !Number.isSafeInteger(revision) || revision < 0) throw new Error('来源绑定输入不合法');
  const device = readDevice(home); const repository = repositoryRoot(path); const directory = privateDirectory(join(home, 'sources'));
  const target = join(directory, `${sourceId}.json`); if (existsSync(target)) readPrivate(target);
  const value: SourceBinding = { server: device.server, deviceId: device.id, sourceId, revision, repository };
  const temp = join(directory, `${randomUUID()}.tmp`); writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); renameSync(temp, target);
}
/**
 * 读取与当前设备绑定的来源许可；缺失返回null，权限异常不自动绕过。
 * @param home 私有设备根。
 * @param sourceId 平台来源UUID，不能为路径。
 * @returns 当前设备本机许可，缺失null；仓库真实路径在执行器再次检查。
 * @throws {Error} 来源文件、身份或字段不合法时拒绝。
 */
export function sourceBinding(home: string, sourceId: string): SourceBinding | null {
  if (!isUuid(sourceId)) throw new Error('来源标识不合法');
  const device = readDevice(home); const directory = privateDirectory(join(home, 'sources')); const file = join(directory, `${sourceId}.json`); if (!existsSync(file)) return null;
  const value: unknown = JSON.parse(readPrivate(file)); if (!value || typeof value !== 'object') throw new Error('来源许可不合法');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join() !== 'deviceId,repository,revision,server,sourceId' || data.server !== device.server || data.deviceId !== device.id || data.sourceId !== sourceId || typeof data.repository !== 'string' || !Number.isSafeInteger(data.revision) || Number(data.revision) < 0) throw new Error('来源许可不匹配');
  return data as unknown as SourceBinding;
}

/**
 * 所有者撤销一个本机来源许可；不改变平台来源授权，正在执行者在下一次续租核对时停止。
 * @param home 已配对私有设备根。
 * @param sourceId 明确来源UUID，不接受路径。
 * @returns 删除完成；不存在幂等，不删除仓库或其他来源许可。
 * @throws {Error} 身份、来源标识或私有文件权限不合法时拒绝。
 */
export function unbindSource(home: string, sourceId: string): void {
  if (sourceBinding(home, sourceId)) unlinkSync(join(home, 'sources', `${sourceId}.json`));
}
