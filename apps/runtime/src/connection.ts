/** 设备专用HTTP适配；只使用配对码和设备Bearer，不读取浏览器会话/Git凭证，不执行任务。 */
import { parsePlatform } from '@c2k/contracts';
import type { DeviceCredential, Heartbeat } from '@c2k/contracts';
import { platform, arch } from 'node:os';
/** 设备接入协议版本；任务领取使用独立协议版本，不代表 Agent 或操作系统沙箱能力。 */
export const runtimeVersion = '1';
/** 设备请求受控失败，不携带响应正文、凭证或底层网络错误。 */
export class ConnectionFailure extends Error {
  /** HTTP错误状态，0表示网络/契约错误。 */
  readonly status: number;
  /** @param status HTTP状态，0为网络失败。 @returns 安全失败实例，不含响应正文。 */
  constructor(status: number) { super(status === 401 ? '设备凭证已失效，请在平台重新配对' : status === 409 ? '平台不支持当前运行时协议' : '平台连接失败，请检查网络后重试'); this.status = status; }
}
/**
 * 验证平台origin，远程必须HTTPS；本机开发仅允许明确IPv4/IPv6回环HTTP，不接受DNS别名。
 * @param value 用户选择的平台origin，不为空。
 * @returns 规范origin，不含路径、认证、查询及片段。
 * @throws {Error} 非法origin或不安全远程HTTP时拒绝。
 */
export function serverOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('平台地址须为HTTPS origin；本机仅支持127.0.0.1或[::1]的HTTP');
  return url.origin;
}
/**
 * 发送专用协议请求，禁止重定向并限制响应32KiB；设备端不接受Cookie身份。
 * @param origin 已验证的平台origin，不为空。
 * @param path 固定设备协议路径，不为空。
 * @param options 请求体/头，不在日志打印。
 * @returns 未校验JSON，必须按公开协议解析，不为空。
 * @throws {ConnectionFailure} 网络、超时、状态、正文或格式不合法时失败。
 */
async function request(origin: string, path: string, options: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, origin), { ...options, method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), credentials: 'omit' });
    if (!response.ok) { await response.body?.cancel(); throw new ConnectionFailure(response.status); }
    if (!response.body) throw new ConnectionFailure(0);
    const reader = response.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 32768) throw new ConnectionFailure(0); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (error instanceof ConnectionFailure) throw error; throw new ConnectionFailure(0); }
}
/**
 * 兑换单次配对资料，设备信息仅自报展示，不声明源访问/沙箱能力。
 * @param origin 平台origin，不为空，运行时仍重新校验。
 * @param code 43位base64url单次码，不为空，不允许日志记录。
 * @param name 用户命名，不为空，最多80字符。
 * @returns 只供本机保存的设备专用凭证，不为空。
 * @throws {Error} 输入、协议或平台失败时拒绝。
 */
export async function pair(origin: string, code: string, name: string): Promise<DeviceCredential> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !name.trim() || name.trim().length > 80) throw new Error('配对输入不合法');
  const value = parsePlatform('DeviceCredential', await request(serverOrigin(origin), '/runtime/v1/pair', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: name.trim(), os: platform(), arch: arch(), version: runtimeVersion }) }));
  if (!/^[a-f0-9-]{36}$/.test(value.id) || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !Number.isFinite(Date.parse(value.expiresAt))) throw new ConnectionFailure(0);
  return value;
}
/**
 * 发送专用心跳，只返回设备身份与服务端时间，不轮询/领取任务。
 * @param origin 已保存平台origin，重新校验。
 * @param token 设备专用Bearer，不为空，不进入日志。
 * @returns 真实心跳确认，不为空。
 * @throws {ConnectionFailure} 撤销、过期、所有者禁用或网络失败时拒绝。
 */
export async function heartbeat(origin: string, token: string): Promise<Heartbeat> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ConnectionFailure(401);
  const result = parsePlatform('Heartbeat', await request(serverOrigin(origin), '/runtime/v1/heartbeat', { headers: { Authorization: `Bearer ${token}` } }));
  if (!/^[a-f0-9-]{36}$/.test(result.id) || !Number.isFinite(Date.parse(result.serverTime))) throw new ConnectionFailure(0);
  return result;
}

/** @param origin 已保存平台origin @param token 设备Bearer，不记录 @returns 本次任务租约，无任务available=false @throws {ConnectionFailure} 网络/凭证/契约错误时拒绝 */
export async function claimTask(origin: string, token: string) { return parsePlatform('TaskLease', await request(serverOrigin(origin), '/runtime/v1/tasks/claim', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '1' }) })); }
/**
 * 发送续租或来源清单；未知字段由调用方契约限定，不发送宿主路径或源码。
 * @param origin 平台origin @param token 专用设备Bearer @param taskId 已校验任务UUID @param payload 当前租约及可选清单 @param complete true提交false续租
 * @returns 服务端租约确认，valid=false必须停止当前进程组。
 * @throws {ConnectionFailure} 网络、凭证或协议失败时拒绝；调用方停止工作，不无授权续算。
 */
export async function reportTask(origin: string, token: string, taskId: string, payload: object, complete: boolean) {
  if (!/^[a-f0-9-]{36}$/.test(taskId)) throw new ConnectionFailure(0);
  return parsePlatform('TaskAck', await request(serverOrigin(origin), `/runtime/v1/tasks/${taskId}/${complete ? 'complete' : 'renew'}`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
}

/** @param origin 平台origin @param token 设备专用Bearer，不记录 @returns 多来源逆向租约，模型配置留本机 @throws {ConnectionFailure} 协议/网络/身份失败 */
export async function claimAnalysis(origin: string, token: string) { return parsePlatform('AnalysisLease', await request(serverOrigin(origin), '/runtime/v1/analyses/claim', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '1' }) })); }

/** @param origin 平台origin @param token 设备Bearer，不记录 @returns 固定来源检查或空id；诊断不可用时跳过，不跳过后续任务鉴权 @throws {ConnectionFailure} 设备401仍终止 */
export async function claimReadiness(origin: string, token: string) { try { return parsePlatform('Readiness', await request(serverOrigin(origin), '/runtime/v1/readiness/claim', { headers: { Authorization: `Bearer ${token}` } })); } catch (error) { if (error instanceof ConnectionFailure && error.status === 401) throw error; return null; } }
/** @param origin 平台origin @param token 设备Bearer，不记录 @param id 当前检查UUID @param checks 六项固定状态 @returns 已完成短期状态 @throws {ConnectionFailure} 过期、撤权或响应失败，不自动重试提交 */
export async function reportReadiness(origin: string, token: string, id: string, checks: import('@c2k/contracts').ReadinessCheck[]) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new ConnectionFailure(0); return parsePlatform('Readiness', await request(serverOrigin(origin), `/runtime/v1/readiness/${id}/complete`, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ checks }) })); }
