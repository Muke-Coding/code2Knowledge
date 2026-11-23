/** 运行时本机Claude专用配置；不向平台上传模型、端点或密钥，不继承个人登录、代理、插件与MCP。 */
import { openSync, closeSync, fstatSync, readSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { privateDirectory } from './store.js';
/** 设备所有者显式选择的专用模型配置；内网归属由企业部署网络治理，不靠URL推断。 */
export interface AgentProfile {
  /** 本机Claude可执行文件绝对路径，不接受shell命令。 */
  executable: string;
  /** 可选本机MarkItDown可执行文件绝对路径；资料需要转换却未配置时失败，不动态下载安装。 */
  converter?: string;
  /** 允许的Claude精确版本，执行前核对。 */
  version: string;
  /** 企业内网Anthropic兼容基础URL，HTTPS或明确回环HTTP；禁止认证/查询/片段。 */
  endpoint: string;
  /** 企业部署的模型标识，不自动回退其他模型。 */
  model: string;
  /** 仅本机受限普通文件内API key，不是环境变量名或平台凭证。 */
  secretFile: string;
}
/**
 * 以固定描述符有界读取当前用户受限文件，不跟随最终链接；仅本机调用，不回显异常内容。
 * @param path 用户明确选择的绝对文件路径
 * @param limit 最大原始字节数
 * @returns 同一描述符读取的完整字节，不为空
 * @throws {Error} 非普通文件/属主权限/长度变化或超限时拒绝
 */
export function readLocalSecretFile(path: string, limit = 8192): Buffer {
  if (!isAbsolute(path)) throw new Error('配置必须为绝对文件路径');
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor); if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.size < 1 || stat.size > limit) throw new Error('配置文件须为本人私有普通文件');
    const bytes = Buffer.alloc(stat.size + 1); let offset = 0;
    while (offset < bytes.length) { const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset); if (!count) break; offset += count; }
    if (offset !== stat.size) throw new Error('配置读取期间变化'); return bytes.subarray(0, offset);
  } finally { closeSync(descriptor); }
}
/** @param value 不可信本地JSON，不含密钥正文 @returns 严格有效专用配置 @throws {Error} 字段、URL、模型、版本或路径不合法 */
export function validateAgentProfile(value: unknown): AgentProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置格式错误'); const data = value as Record<string, unknown>;
  if (Object.keys(data).filter((key) => key !== 'converter').sort().join() !== 'endpoint,executable,model,secretFile,version' || Object.values(data).some((item) => typeof item !== 'string')) throw new Error('配置字段错误');
  const profile = data as unknown as AgentProfile; const url = new URL(profile.endpoint);
  if ((profile.converter !== undefined && !isAbsolute(profile.converter)) || !isAbsolute(profile.executable) || !isAbsolute(profile.secretFile) || !/^\d+\.\d+\.\d+$/.test(profile.version) || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(profile.model) || url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('配置值错误');
  return profile;
}
/**
 * 保存设备本地模型选择，平台不参与模型配置；不读取密钥内容、不探测端点或调用模型。
 * @param home 私有运行时根
 * @param file 本人0600的JSON配置路径，必须显式选择
 * @returns 原子保存配置；不输出端点、模型或密钥路径
 * @throws {Error} 目录、配置或写入失败，旧配置保留
 */
export function configureAgent(home: string, file: string): void {
  const directory = privateDirectory(home); const profile = validateAgentProfile(JSON.parse(readLocalSecretFile(file).toString('utf8')));
  const temporary = join(directory, `${randomUUID()}.tmp`);
  try { writeFileSync(temporary, JSON.stringify(profile), { flag: 'wx', mode: 0o600 }); renameSync(temporary, join(directory, 'agent.json')); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
/** @param home 私有运行时根 @returns 当前专用配置；不存在返回null，不回退全局Claude设置 @throws {Error} 格式或权限异常时拒绝 */
export function readAgentProfile(home: string): AgentProfile | null { const path = join(privateDirectory(home), 'agent.json'); return existsSync(path) ? validateAgentProfile(JSON.parse(readLocalSecretFile(path).toString('utf8'))) : null; }
