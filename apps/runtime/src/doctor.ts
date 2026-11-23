/** 设备端基础诊断模块；不注册设备、不读取 Git 凭证、不发起逆向任务。 */
import { readHealthResponse } from '@c2k/contracts';

/** 诊断返回值，不表示配对或来源访问已获授权。 */
export interface DoctorResult {
  /** 本地 Node 主版本是否符合本阶段支持范围。 */
  nodeSupported: boolean;
  /** 未指定服务时为未检查，否则仅报告基础健康。 */
  platform: 'not_checked' | 'up' | 'unavailable';
}

/**
 * 检查 Node 主版本以及可选平台存活，失败信息不包含响应正文或凭证。
 * @param server 仅允许无认证信息、无路径/查询的 HTTP(S) origin；省略表示不访问网络。
 * @param nodeVersion 测试可注入的 Node 版本号，非空且不带 v 前缀。
 * @returns 诊断结果，不返回 null；网络失败表示 unavailable。
 * @throws {Error} 服务地址无效、含认证信息或非 origin 时抛出。
 */
export async function diagnose(server?: string, nodeVersion = process.versions.node): Promise<DoctorResult> {
  const result: DoctorResult = { nodeSupported: nodeVersion.split('.')[0] === '22', platform: 'not_checked' };
  if (server === undefined) return result;
  const url = new URL(server);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('服务地址必须是无凭证、无路径参数的 HTTP(S) origin');
  }
  try {
    const response = await fetch(new URL('/actuator/health', url), { signal: AbortSignal.timeout(5000), redirect: 'error' });
    result.platform = (await readHealthResponse(response)).status === 'UP' ? 'up' : 'unavailable';
  } catch {
    result.platform = 'unavailable';
  }
  return result;
}
