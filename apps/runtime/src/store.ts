/** 私有设备凭证存储；独立受限目录，不读取Skill配置或仓库；POSIX拒绝符号链接与宽权限。 */
import { mkdirSync, lstatSync, readFileSync, openSync, writeFileSync, closeSync, constants, unlinkSync, existsSync, fstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { serverOrigin } from './connection.js';
/** 设备本地持久化契约，禁止序列化到日志或发送给浏览器。 */
export interface StoredDevice {
  /** 唯一平台origin，不允许远程明文HTTP。 */
  server: string;
  /** 设备UUID，不为空。 */
  id: string;
  /** 专用设备凭证，不为空。 */
  token: string;
  /** 凭证ISO有效期，不为空。 */
  expiresAt: string;
}
/** @returns 本次选择的设备目录，默认用户目录下独立runtime子目录，不为空。 */
export function runtimeHome(): string { return resolve(process.env.C2K_RUNTIME_HOME ?? join(homedir(), '.code2knowledge', 'runtime')); }
/**
 * 验证目录为当前用户私有真实目录；只支持本轮POSIX文件权限，不冒充Windows ACL支持。
 * @param home 用户显式选择的凭证目录，不为空。
 * @returns 已校验目录路径，不为空。
 * @throws {Error} 符号链接、非当前用户、权限过宽或非POSIX时拒绝。
 */
export function privateDirectory(home: string): string {
  if (process.platform === 'win32') throw new Error('本轮设备凭证存储尚未验收Windows ACL');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const stat = lstatSync(home);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('设备目录必须为当前用户私有目录（权限700），不允许符号链接');
  return home;
}
/**
 * 以不跟随链接方式读取受限小文件，防止凭证目录内的链接泄露其他文件。
 * @param path 私有目录内文件路径，不为空。
 * @returns 文件文本，不为空；读取后立即关闭描述符。
 * @throws {Error} 非普通文件、属主/权限不符或大于8KiB时拒绝。
 */
export function readPrivate(path: string): string {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 8192) throw new Error('本地设备文件不安全');
    return readFileSync(descriptor, 'utf8');
  } finally { closeSync(descriptor); }
}
/**
 * 读取受限凭证，不把任何字段打印到日志。
 * @param home 私有设备目录，不为空。
 * @returns 受校验本地凭证，不为空。
 * @throws {Error} 文件缺失、权限或字段/地址不合法时拒绝。
 */
export function readDevice(home: string): StoredDevice {
  privateDirectory(home);
  const value: unknown = JSON.parse(readPrivate(join(home, 'device.json')));
  if (!value || typeof value !== 'object') throw new Error('设备未配对');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join() !== 'expiresAt,id,server,token' || typeof data.server !== 'string' || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.id) || typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token) || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('设备凭证格式不正确');
  serverOrigin(data.server);
  return data as unknown as StoredDevice;
}
/**
 * 仅新建凭证文件，拒绝覆盖已有配对；写入失败清理本次不完整文件，不改变其他文件。
 * @param home 设备私有目录，不为空。
 * @param value 新兑换的凭证，不为空，不能日志输出。
 * @returns 写入完成，无业务返回。
 * @throws {Error} 已配对、权限或写入失败时拒绝；已消费码需重新生成。
 */
export function saveDevice(home: string, value: StoredDevice): void {
  privateDirectory(home);
  const path = join(home, 'device.json');
  const descriptor = openSync(path, 'wx', 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value), 'utf8'); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(descriptor); }
}
/**
 * 提前拒绝覆盖，避免在已配对目录消费新配对码；并发仍由最终wx写入阻止。
 * @param home 私有设备目录，不为空。
 * @returns 目录可用于新配对，无业务返回。
 * @throws {Error} 存在凭证文件或链接时拒绝。
 */
export function requireUnpaired(home: string): void { privateDirectory(home); if (existsSync(join(home, 'device.json'))) throw new Error('该目录已有设备配对，请选择新的C2K_RUNTIME_HOME；旧设备请在平台撤销'); }
