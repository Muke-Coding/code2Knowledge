/** 同源浏览器API入口；会话凭据不落localStorage，每次写入取得会话CSRF，响应执行源契约校验。 */
import { parsePlatform } from '@c2k/contracts';
import type { Session, Member, CatalogSystem, Grant } from '@c2k/contracts';

/** 本地登录凭证，仅在本次请求与表单内存在，不持久化。 */
export interface LoginValues {
  /** 部署内登录名，不为空。 */
  username: string;
  /** 本次密码，不为空，不记录。 */
  password: string;
}
/** 管理员创建普通成员输入，不包含角色与企业字段。 */
export interface NewMemberValues extends LoginValues {
  /** 显示名称，1到80字符，不为空。 */
  displayName: string;
}

/** 受控HTTP失败；仅展示通过错误契约校验的提示，不显示网络堆栈或未知正文。 */
export class ApiFailure extends Error {
  /** HTTP失败状态，0表示网络或响应契约失败。 */
  readonly status: number;
  /**
   * 创建浏览器可处理失败。
   * @param status HTTP状态，0表示非HTTP失败。
   * @param message 安全中文提示，不含凭证与未知服务正文。
   * @returns 新异常实例，不为空。
   */
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/**
 * 有界读取JSON，避免错误代理返回无限内容；超时由调用方控制。
 * @param response HTTP响应，不为空。
 * @param maximum 最大响应字节数；默认1MiB，资产JSON因转义允许4MiB。
 * @returns 未校验JSON，可能为null，必须经契约校验再使用。
 * @throws {Error} 正文超过调用方上限、为空或JSON无效时拒绝。
 */
async function body(response: Response, maximum = 1048576): Promise<unknown> {
  if (!response.body) throw new Error('响应正文为空');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let count = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      count += part.value.byteLength; if (count > maximum) throw new Error('响应超限');
      content += decoder.decode(part.value, { stream: true });
    }
    content += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return JSON.parse(content);
}
/**
 * 发送同源请求，统一超时与错误处理；无自动重试，避免重复创建。
 * @param path 固定同源API路径，不为空。
 * @param options 请求方法与正文，默认GET，不得包含外部URL。
 * @returns 未校验响应JSON；204返回null。
 * @throws {ApiFailure} 网络、契约或受控HTTP错误时抛出。
 */
async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', redirect: 'error', signal: controller.signal });
    if (!response.ok) {
      if (response.status === 423) window.dispatchEvent(new Event('c2k-session-locked'));
      if (response.status === 403) window.dispatchEvent(new Event('c2k-permissions-changed'));
      if (response.status === 401 && path !== '/api/v1/auth/login') window.dispatchEvent(new Event('c2k-session-expired'));
      let message = '请求未完成，请稍后重试';
      try { message = parsePlatform('ApiError', await body(response, path.includes('/content?') ? 4194304 : 1048576)).message; } catch { /* 不展示不可信代理正文。 */ }
      throw new ApiFailure(response.status, message);
    }
    return response.status === 204 ? null : await body(response, path.includes('/content?') ? 4194304 : 1048576);
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure(0, '无法连接平台，请确认服务已启动后重试');
  } finally { window.clearTimeout(timeout); }
}
/**
 * 使用当前会话CSRF发送写入，登录和退出也不豁免；令牌只在本次调用内存在。
 * @param path 同源API路径，不为空。
 * @param method POST/PATCH/DELETE，不为空。
 * @param payload JSON对象或表单；无正文允许undefined。
 * @returns 未校验JSON，204返回null。
 * @throws {ApiFailure} CSRF失效、权限或业务失败时抛出。
 */
async function write(path: string, method: string, payload?: object | URLSearchParams): Promise<unknown> {
  const csrf = parsePlatform('Csrf', await request('/api/v1/auth/csrf'));
  const form = payload instanceof URLSearchParams;
  return request(path, { method, headers: { [csrf.headerName]: csrf.token, 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: payload ? (form ? payload.toString() : JSON.stringify(payload)) : null });
}
/** @returns 当前公开会话，不为空。 @throws {ApiFailure} 未登录或禁用时401。 */
export async function getSession(): Promise<Session> { return parsePlatform('Session', await request('/api/v1/auth/session')); }
/**
 * 本地身份登录，服务端轮换会话；密码不缓存且不记录。
 * @param username 登录名，不为空。
 * @param password 本次密码，不为空。
 * @returns 登录后的公开会话，不为空。
 * @throws {ApiFailure} 密码错误、限速或网络失败时拒绝。
 */
export async function login(username: string, password: string): Promise<Session> {
  await write('/api/v1/auth/login', 'POST', new URLSearchParams({ username, password })); return getSession();
}
/** @returns 退出完成，无返回数据。 @throws {ApiFailure} 会话或网络失败时拒绝。 */
export async function logout(): Promise<void> { await write('/api/v1/auth/logout', 'POST'); }
/** @returns 当前可见系统，不返回隐藏系统数量。 @throws {Error} 响应不是合法数组时拒绝。 */
export async function listSystems(): Promise<CatalogSystem[]> {
  const result = await request('/api/v1/systems'); if (!Array.isArray(result)) throw new Error('目录响应不合法');
  return result.map((item) => parsePlatform('CatalogSystem', item));
}
/** @param name 系统名称，不为空。 @param description 描述，可为空字符串。 @returns 新目录，不为空。 @throws {ApiFailure} 非管理员、冲突或参数失败时拒绝。 */
export async function createSystem(name: string, description: string): Promise<CatalogSystem> { return parsePlatform('CatalogSystem', await write('/api/v1/systems', 'POST', { name, description })); }
/** @param id 系统UUID，不为空。 @returns 当前授权目录，不为空。 @throws {ApiFailure} 越权或不存在均404。 */
export async function getSystem(id: string): Promise<CatalogSystem> { return parsePlatform('CatalogSystem', await request(`/api/v1/systems/${encodeURIComponent(id)}`)); }
/** @returns 同企业公开成员视图，不为空。 @throws {Error} 非管理员或契约失败时拒绝。 */
export async function listMembers(): Promise<Member[]> {
  const result = await request('/api/v1/members'); if (!Array.isArray(result)) throw new Error('成员响应不合法');
  return result.map((item) => parsePlatform('Member', item));
}
/** @param values 新普通成员资料和密码，不为空。 @returns 新成员公开视图，不含密码。 @throws {ApiFailure} 权限、重名或参数失败时拒绝。 */
export async function createMember(values: NewMemberValues): Promise<Member> { return parsePlatform('Member', await write('/api/v1/members', 'POST', values)); }
/** @param id 普通成员UUID，不为空。 @param enabled 目标状态。 @returns 更新完成，无数据。 @throws {ApiFailure} 无管理资格或目标非法时拒绝。 */
export async function setMemberStatus(id: string, enabled: boolean): Promise<void> { await write(`/api/v1/members/${encodeURIComponent(id)}/status`, 'PATCH', { enabled }); }
/** @param id 同企业系统UUID，不为空。 @returns 目录读取授权，不为空。 @throws {Error} 权限或契约失败时拒绝。 */
export async function listGrants(id: string): Promise<Grant[]> {
  const result = await request(`/api/v1/systems/${encodeURIComponent(id)}/grants`); if (!Array.isArray(result)) throw new Error('授权响应不合法');
  return result.map((item) => parsePlatform('Grant', item));
}
/** @param id 系统UUID，不为空。 @param memberId 普通成员UUID，不为空。 @param granted true授予、false撤销。 @returns 写入完成，无数据。 @throws {ApiFailure} 权限、CSRF或目标失败时拒绝。 */
export async function setGrant(id: string, memberId: string, granted: boolean): Promise<void> {
  const base = `/api/v1/systems/${encodeURIComponent(id)}/grants`;
  await write(granted ? base : `${base}/${encodeURIComponent(memberId)}`, granted ? 'POST' : 'DELETE', granted ? { memberId } : undefined);
}
/** @param error 未知失败，允许null。 @returns 安全中文提示，不回显未知异常文本。 */
export function failureMessage(error: unknown): string { return error instanceof ApiFailure ? error.message : '响应格式不正确，请刷新后重试'; }
/** @returns 当前所有者私有设备，不含凭证。 @throws {Error} 身份或响应契约错误时拒绝。 */
export async function listDevices() {
  const result = await request('/api/v1/devices'); if (!Array.isArray(result)) throw new Error('设备响应不合法');
  return result.map((item) => parsePlatform('Device', item));
}
/** @returns 新5分钟单次配对码，仅保留页面内存，禁止日志记录。 @throws {ApiFailure} 会话或CSRF错误时拒绝。 */
export async function createPairing() { return parsePlatform('Pairing', await write('/api/v1/devices/pairings', 'POST')); }
/** @param id 所有者设备UUID，不为空。 @returns 撤销完成，无返回数据。 @throws {ApiFailure} 无权、身份失效或写保护失败时拒绝。 */
export async function revokeDevice(id: string): Promise<void> { await write(`/api/v1/devices/${encodeURIComponent(id)}`, 'DELETE'); }

/** 角色写入请求；权限必须显式提交，空数组代表无附加动作。 */
export interface RoleInput {
  /** 企业内角色名，1至80字符。 */
  name: string;
  /** 职责说明，可为空字符串。 */
  description: string;
  /** 已实现动作码数组，不允许重复或未知值。 */
  permissions: string[];
  /** 编辑时当前版本，创建可不传。 */
  revision?: number;
}
/** @returns 当前企业及只读内置角色。 @throws {Error} 权限不足或响应契约不符时拒绝。 */
export async function listRoles() {
  const values = await request('/api/v1/roles'); if (!Array.isArray(values)) throw new Error('角色响应不合法');
  return values.map((value) => parsePlatform('Role', value));
}
/** @returns 已实现权限目录。 @throws {Error} 权限不足或契约不符时拒绝。 */
export async function listPermissions() {
  const values = await request('/api/v1/permissions'); if (!Array.isArray(values)) throw new Error('权限响应不合法');
  return values.map((value) => parsePlatform('Permission', value));
}
/** @param input 完整角色输入，不为空。 @param id 编辑角色ID，undefined创建。 @returns 新角色版本。 @throws {ApiFailure} 无权、重名或冲突时拒绝，不自动覆盖。 */
export async function saveRole(input: RoleInput, id?: string) { return parsePlatform('Role', await write(id ? `/api/v1/roles/${encodeURIComponent(id)}` : '/api/v1/roles', id ? 'PUT' : 'POST', input)); }
/** @param id 自定义角色ID。 @param revision 当前版本。 @returns 删除完成。 @throws {ApiFailure} 有成员引用、内置或版本冲突时拒绝。 */
export async function deleteRole(id: string, revision: number): Promise<void> { await write(`/api/v1/roles/${encodeURIComponent(id)}?revision=${revision}`, 'DELETE'); }
/** @param id 普通成员ID。 @returns 当前角色ID和并发版本。 @throws {ApiFailure} 无权或目标非法时拒绝。 */
export async function getMemberRoles(id: string) { return parsePlatform('MemberRoles', await request(`/api/v1/members/${encodeURIComponent(id)}/roles`)); }
/** @param id 普通成员ID。 @param roleIds 显式角色数组，空表示撤销附加角色。 @param revision 已读取版本。 @returns 分配完成。 @throws {ApiFailure} 无权、跨企业或版本冲突时拒绝。 */
export async function setMemberRoles(id: string, roleIds: string[], revision: number): Promise<void> { await write(`/api/v1/members/${encodeURIComponent(id)}/roles`, 'PUT', { roleIds, revision }); }

/** 来源配置输入；无凭证、文件正文或模型参数，分支和系统绑定由用户明确选择。 */
export interface SourceInput {
  /** 企业内展示名称，不能为空。 */
  name: string;
  /** 仓库或运行时资料定位，创建后不可改变类型。 */
  kind: 'REPOSITORY' | 'DOCUMENT';
  /** 不含凭证的Git定位，或运行时资料根下的相对路径。 */
  locator: string;
  /** 仓库明确分支；资料必须传空字符串。 */
  branch: string;
  /** 是否允许新的分析资格检查。 */
  enabled: boolean;
  /** 至少一个同企业系统UUID，不产生继承授权。 */
  systemIds: string[];
  /** 编辑所依据配置版本，创建可省略。 */
  revision?: number;
}
/** @param page 从1开始页码 @param keyword 名称检索，允许空串 @returns 逐项权限过滤后的分页，不含隐藏来源数 @throws {ApiFailure} 身份、权限或参数失败时拒绝 */
export async function listSources(page: number, keyword: string) { return parsePlatform('SourcePage', await request(`/api/v1/sources?page=${page}&keyword=${encodeURIComponent(keyword)}`)); }
/** @param id 来源UUID @returns 当前可见元数据 @throws {ApiFailure} 隐藏或不存在404 */
export async function getSource(id: string) { return parsePlatform('Source', await request(`/api/v1/sources/${encodeURIComponent(id)}`)); }
/** @param input 明确来源配置 @param id 编辑ID，创建省略 @returns 保存后的配置版本 @throws {ApiFailure} 版本冲突409，不自动覆盖 */
export async function saveSource(input: SourceInput, id?: string) { return parsePlatform('Source', await write(id ? `/api/v1/sources/${encodeURIComponent(id)}` : '/api/v1/sources', id ? 'PUT' : 'POST', input)); }
/** @param id 来源UUID，省略返回管理选择项 @returns 同企业系统摘要，不授予系统内容权限 @throws {Error} 权限或契约不符时拒绝 */
export async function sourceSystems(id?: string) {
  const values = await request(id ? `/api/v1/sources/${encodeURIComponent(id)}/bindings` : '/api/v1/sources/system-options');
  if (!Array.isArray(values)) throw new Error('系统摘要不合法'); return values.map((value) => parsePlatform('CatalogSystem', value));
}
/** @param id 来源UUID @returns 成员范围授权及配置是否过期 @throws {Error} 无管理资格或契约不符时拒绝 */
export async function sourceGrants(id: string) {
  const values = await request(`/api/v1/sources/${encodeURIComponent(id)}/grants`); if (!Array.isArray(values)) throw new Error('来源授权不合法');
  return values.map((value) => parsePlatform('SourceGrant', value));
}
/** @param id 来源UUID @param memberId 同企业成员UUID @param revision 当前配置版本 @param allow 授予或撤销 @returns 幂等操作完成 @throws {ApiFailure} 权限、版本或停用失败时拒绝 */
export async function setSourceGrant(id: string, memberId: string, revision: number, allow: boolean): Promise<void> { await write(`/api/v1/sources/${encodeURIComponent(id)}/grants/${allow}`, 'PUT', { memberId, revision }); }
/** @param id 来源UUID @param revision 当前配置版本 @returns 当前分析资格；不是执行票据，不拉代码或读资料 @throws {ApiFailure} 动作与范围不满足时拒绝 */
export async function checkSource(id: string, revision: number) { return parsePlatform('SourceCheck', await write(`/api/v1/sources/${encodeURIComponent(id)}/analysis-check`, 'POST', { revision })); }

/** 来源预检创建输入；幂等键由页面为一次创建生成，网络重试保留相同值。 */
export interface TaskInput {
  /** 任务名称，1至120字符。 */
  name: string;
  /** 当前逐项授权仓库来源UUID。 */
  sourceId: string;
  /** 确认的来源配置版本。 */
  sourceRevision: number;
  /** 本人私有设备UUID。 */
  deviceId: string;
  /** 本次创建幂等UUID。 */
  requestId: string;
}
/** @param page 从1开始的页码 @returns 本人任务分页，无他人数量 @throws {ApiFailure} 身份或契约失败 */
export async function listTasks(page: number) { return parsePlatform('TaskPage', await request(`/api/v1/tasks?page=${page}`)); }
/** @param input 已确认来源/设备和幂等键 @returns 新任务或原同请求任务 @throws {ApiFailure} 无范围、版本或幂等冲突拒绝，不自动新建 */
export async function createTask(input: TaskInput) { return parsePlatform('Task', await write('/api/v1/tasks', 'POST', input)); }
/** @param id 本人任务UUID @returns 当前状态 @throws {ApiFailure} 他人或不存在404 */
export async function getTask(id: string) { return parsePlatform('Task', await request(`/api/v1/tasks/${encodeURIComponent(id)}`)); }
/** @param id 本人任务UUID @returns 所有尝试，新尝试在前 @throws {Error} 契约或权限失败 */
export async function taskAttempts(id: string) { const values = await request(`/api/v1/tasks/${encodeURIComponent(id)}/attempts`); if (!Array.isArray(values)) throw new Error('尝试列表不合法'); return values.map((value) => parsePlatform('Task', value)); }
/** @param id 本人任务UUID @param revision 当前控制版本 @param retry true重试false取消 @returns 最新状态 @throws {ApiFailure} 旧版本或不允许状态409，不能覆盖 */
export async function controlTask(id: string, revision: number, retry: boolean) { return parsePlatform('Task', await write(`/api/v1/tasks/${encodeURIComponent(id)}/${retry ? 'retry' : 'cancel'}`, 'POST', { revision })); }

/** @param page 从1开始的页码 @returns 当前仍具全部来源资格的本人候选，不含他人数量 @throws {ApiFailure} 身份、权限或网络失败；契约不符拒绝 */
export async function listCandidates(page: number) { return parsePlatform('CandidatePage', await request(`/api/v1/candidates?page=${page}`)); }
/** @param id 本人候选UUID @returns 固定内核校验的资产摘要，不含正文 @throws {ApiFailure} 无权或不存在均404，动作资格缺失403 */
export async function getCandidate(id: string) { return parsePlatform('CandidateReport', await request(`/api/v1/candidates/${encodeURIComponent(id)}`)); }
/**
 * 当前会话重新授权并下载原始ZIP，不将文件作为HTML展示或打开外部URL。
 * @param id 本人候选UUID，不为空。
 * @param signal 页面生命周期中止信号，关闭候选或卸载时必须中止。
 * @returns 浏览器开始下载；对象URL在触发后释放，不持久保存正文。
 * @throws {ApiFailure} 读取超8MiB、超时、失去授权或响应格式错误时拒绝。
 */
export async function downloadCandidate(id: string, signal: AbortSignal): Promise<void> {
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 20000); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`/api/v1/candidates/${encodeURIComponent(id)}/archive`, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([controller.signal, signal]) });
    if (!response.ok) {
      if (response.status === 423) window.dispatchEvent(new Event('c2k-session-locked'));
      if (response.status === 403) window.dispatchEvent(new Event('c2k-permissions-changed')); if (response.status === 401) window.dispatchEvent(new Event('c2k-session-expired')); throw new ApiFailure(response.status, response.status === 404 ? '候选不存在或已失去来源授权' : '无法下载候选，请稍后重试'); }
    if (!response.body || response.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream') throw new Error('download');
    reader = response.body.getReader(); const parts: Uint8Array<ArrayBuffer>[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 8388608) throw new Error('limit'); parts.push(new Uint8Array(part.value)); }
    signal.throwIfAborted(); controller.signal.throwIfAborted();
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `candidate-${id}.zip`; document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (reason) { if (reason instanceof ApiFailure) throw reason; throw new ApiFailure(0, '下载未完成，请重试'); }
  finally { window.clearTimeout(timeout); await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
}

/** 多来源逆向创建输入；Web不收集模型端点或凭证，资料选择必须显式提交。 */
export interface AnalysisInput {
  /** 用户任务名称。 */
  name: string;
  /** 产品稳定slug。 */
  product: string;
  /** 业务域稳定slug。 */
  domain: string;
  /** 明确业务范围，1至2000字符。 */
  scope: string;
  /** INCLUDE必须选资料，NONE不得含资料。 */
  documentsChoice: 'INCLUDE' | 'NONE';
  /** 全部代码/资料来源及本次稳定别名，最多16项。 */
  sources: AnalysisSourceInput[];
  /** 本人私有设备UUID。 */
  deviceId: string;
  /** 创建幂等UUID。 */
  requestId: string;
}
/** 单个已授权来源选择；不允许覆写平台分支或提交本机目录。 */
export interface AnalysisSourceInput {
  /** 来源UUID。 */
  sourceId: string;
  /** 本次确认配置版本。 */
  revision: number;
  /** 本次唯一材料标识。 */
  alias: string;
}
/** @param page 从1开始 @returns 本人逆向任务分页 @throws {ApiFailure} 身份或响应契约不合法 */
export async function listAnalyses(page: number) { return parsePlatform('AnalysisPage', await request(`/api/v1/analyses?page=${page}`)); }
/** @param input 全部明确业务输入，不含模型配置 @returns 新任务或同幂等原任务 @throws {ApiFailure} 无权限/来源变化/参数或幂等冲突 */
export async function createAnalysis(input: AnalysisInput) { return parsePlatform('AnalysisTask', await write('/api/v1/analyses', 'POST', input)); }
/** @param id 本人任务UUID @returns 当前固定范围与尝试 @throws {ApiFailure} 不存在/非本人404 */
export async function getAnalysis(id: string) { return parsePlatform('AnalysisTask', await request(`/api/v1/analyses/${encodeURIComponent(id)}`)); }
/** @param id 本人任务UUID @param revision 控制版本 @param retry true手动重试false取消 @returns 最新任务 @throws {ApiFailure} 版本冲突/授权失效/终态不能修改 */
export async function controlAnalysis(id: string, revision: number, retry: boolean) { return parsePlatform('AnalysisTask', await write(`/api/v1/analyses/${encodeURIComponent(id)}/${retry ? 'retry' : 'cancel'}`, 'POST', { revision })); }

/** @param id 当前可读候选 @param path 清单资产精确路径 @returns 纯文本封套，不能作为HTML插入 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function getCandidateContent(id: string, path: string) { return parsePlatform('CandidateContent', await request(`/api/v1/candidates/${encodeURIComponent(id)}/content?path=${encodeURIComponent(path)}`)); }
/** @param candidateId 本人候选 @param keyword 审核人姓名搜索 @param page 起始1页码 @returns 最多20名当前可选审核人 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function listReviewers(candidateId: string, keyword: string, page: number) { const value = await request(`/api/v1/reviews/reviewers?candidateId=${encodeURIComponent(candidateId)}&keyword=${encodeURIComponent(keyword)}&page=${page}`); if (!Array.isArray(value) || value.length > 20) throw new Error('审核人响应不合法'); return value.map((row) => parsePlatform('Reviewer', row)); }
/** @param candidateId 本人候选 @param reviewerId 明确本人或其他成员 @param requestId 输入不变的幂等键 @returns 新审核或原幂等结果 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function submitReview(candidateId: string, reviewerId: string, requestId: string) { return parsePlatform('Review', await write('/api/v1/reviews', 'POST', { candidateId, reviewerId, requestId })); }
/** @param page 起始1 @returns 当前可见审核分页，不包含隐藏计数 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function listReviews(page: number) { return parsePlatform('ReviewPage', await request(`/api/v1/reviews?page=${page}`)); }
/** @param id 当前可见审核 @returns 最新快照与控制版本 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function getReview(id: string) { return parsePlatform('Review', await request(`/api/v1/reviews/${encodeURIComponent(id)}`)); }
/** @param id 当前可见审核 @returns 原候选资产清单，不授予原包下载权 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function getReviewReport(id: string) { return parsePlatform('CandidateReport', await request(`/api/v1/reviews/${encodeURIComponent(id)}/report`)); }
/** @param id 当前可见审核 @param path 清单资产路径 @returns IO后重新授权的纯文本 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function getReviewContent(id: string, path: string) { return parsePlatform('CandidateContent', await request(`/api/v1/reviews/${encodeURIComponent(id)}/content?path=${encodeURIComponent(path)}`)); }
/** @param id 受派审核UUID @param revision 期望版本 @param decision 确认/驳回 @param comment 审核依据1至2000字符 @returns 当前决定；不修改原包或发布 @throws {ApiFailure} 当前身份、动作或对象范围失效，以及版本冲突或响应契约不符时拒绝 */
export async function decideReview(id: string, revision: number, decision: 'CONFIRMED' | 'REJECTED', comment: string) { return parsePlatform('Review', await write(`/api/v1/reviews/${encodeURIComponent(id)}/decide`, 'POST', { revision, decision, comment })); }

/** @param id 当前企业来源 @param revision 最新配置版本 @param enabled 明确启停 @returns 新配置，实际变化使旧来源授权失效 @throws {ApiFailure} 无启停动作403或配置冲突409 */
export async function setSourceStatus(id: string, revision: number, enabled: boolean) { return parsePlatform('Source', await write(`/api/v1/sources/${encodeURIComponent(id)}/status`, 'PUT', { revision, enabled })); }

/** 创建就绪检查的明确范围，不包含模型配置。 */
export interface ReadinessInput {
  /** 当前本人设备UUID。 */
  deviceId: string;
  /** 明确INCLUDE或NONE，未选择不提交。 */
  documentsChoice: string;
  /** 当前来源标识、配置版本和唯一别名。 */
  sources: AnalysisInput['sources'];
}
/** @param input 本人设备、显式资料选择与来源版本 @returns 120秒建议性检查，不创建任务 @throws {ApiFailure} 无权、版本变化或已有检查 */
export async function createReadiness(input: ReadinessInput) { return parsePlatform('Readiness', await write('/api/v1/readiness', 'POST', input)); }
/** @param id 本人检查UUID @returns 重新核验当前授权的短期状态 @throws {ApiFailure} 来源撤权或配置变化时拒绝 */
export async function getReadiness(id: string) { return parsePlatform('Readiness', await request(`/api/v1/readiness/${encodeURIComponent(id)}`)); }

/** @returns 当前企业部门平铺树，不含跨企业信息 @throws {ApiFailure} 缺少部门读取动作 */
export async function listDepartments() { const value = await request('/api/v1/departments'); if (!Array.isArray(value)) throw new ApiFailure(0, '部门响应格式错误'); return value.map((row) => parsePlatform('Department', row)); }
/** 部门保存输入，不含可信企业或权限字段。 */
export interface DepartmentInput {
  /** 明确父部门，根为空串。 */
  parentId: string;
  /** 同级部门名。 */
  name: string;
  /** 非负显示排序。 */
  sortOrder: number;
  /** 是否启用。 */
  enabled: boolean;
  /** 最新版本，新建为0。 */
  revision: number;
}
/** @param id 编辑UUID，新建为空 @param input 明确配置 @returns 最新部门 @throws {ApiFailure} 权限、循环或版本冲突 */
export async function saveDepartment(id: string, input: DepartmentInput) { return parsePlatform('Department', await write('/api/v1/departments' + (id ? '/' + encodeURIComponent(id) : ''), id ? 'PUT' : 'POST', input)); }
/** @param id 目标部门 @param revision 最新版本 @returns 删除完成 @throws {ApiFailure} 引用、权限或版本冲突 */
export async function deleteDepartment(id: string, revision: number): Promise<void> { await write(`/api/v1/departments/${encodeURIComponent(id)}?revision=${revision}`, 'DELETE'); }
/** @param id 同企业成员 @returns 主部门与版本 @throws {ApiFailure} 分配权限不足 */
export async function memberDepartment(id: string) { return parsePlatform('MemberDepartment', await request(`/api/v1/members/${encodeURIComponent(id)}/department`)); }
/** @param id 同企业成员 @param departmentId 主部门，空串移除 @param revision 最新分配版本 @returns 分配完成 @throws {ApiFailure} 权限、停用部门或冲突 */
export async function assignDepartment(id: string, departmentId: string, revision: number): Promise<void> { await write(`/api/v1/members/${encodeURIComponent(id)}/department`, 'PUT', { departmentId, revision }); }
/** @returns 固定页面受控配置 @throws {ApiFailure} 缺少menu.read */
export async function listMenus() { const value = await request('/api/v1/menus'); if (!Array.isArray(value)) throw new ApiFailure(0, '菜单响应格式错误'); return value.map((row) => parsePlatform('MenuSetting', row)); }
/** @param row 已注册菜单当前配置 @returns 更新后配置 @throws {ApiFailure} 权限、未知页面或版本冲突 */
export async function saveMenu(row: import('@c2k/contracts').MenuSetting) { return parsePlatform('MenuSetting', await write(`/api/v1/menus/${encodeURIComponent(row.path.slice(1))}`, 'PUT', { title: row.title, group: row.group, sortOrder: row.sortOrder, visible: row.visible, revision: row.revision })); }
/** @param kind 目录SYSTEM或分析SOURCE @param id 资源UUID @returns 当前部门授权 @throws {ApiFailure} 对应资源授权动作不足 */
export async function listDepartmentGrants(kind: 'SYSTEM' | 'SOURCE', id: string) { const value = await request(`/api/v1/department-grants/${kind}/${encodeURIComponent(id)}`); if (!Array.isArray(value)) throw new ApiFailure(0, '授权响应格式错误'); return value.map((row) => parsePlatform('DepartmentGrant', row)); }
/** @param row 明确部门、包含下级和版本 @param allow true授予false撤销 @returns 完成授权更新 @throws {ApiFailure} 权限、配置变化或停用 */
export async function changeDepartmentGrant(row: import('@c2k/contracts').DepartmentGrant, allow: boolean): Promise<void> { await write(`/api/v1/department-grants/${row.resourceKind}/${encodeURIComponent(row.resourceId)}/${allow}`, 'PUT', { departmentId: row.departmentId, includeChildren: row.includeChildren, sourceRevision: row.sourceRevision, revision: row.revision }); }

/** @returns 当前本人资料 @throws {ApiFailure} 身份过期或会话锁定 */
export async function getProfile() { return parsePlatform('Profile', await request('/api/v1/profile')); }
/** @param displayName 本人显示名称 @param revision 最新资料版本 @returns 已保存的本人资料 @throws {ApiFailure} 身份、字段或旧版本失败 */
export async function updateProfile(displayName: string, revision: number) { return parsePlatform('Profile', await write('/api/v1/profile', 'PUT', { displayName, revision })); }
/** @param currentPassword 本次旧密码，不持久化 @param newPassword 本次新密码，不持久化 @returns 成功后当前和其他旧会话失效 @throws {ApiFailure} 旧密码、密码规则或身份不符 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> { await write('/api/v1/profile/password', 'POST', { currentPassword, newPassword }); }
/** @returns 当前有效主体的最小锁状态 @throws {ApiFailure} 身份无效时401，不创建新身份 */
export async function getLockState() { return parsePlatform('LockState', await request('/api/v1/auth/lock-state')); }
/** @returns 当前会话锁定状态 @throws {ApiFailure} 身份或CSRF失败 */
export async function lockSession() { return parsePlatform('LockState', await write('/api/v1/auth/lock', 'POST', {})); }
/** @param password 当前主体密码，只用于本次请求 @returns 解锁后的状态 @throws {ApiFailure} 密码错误、身份过期或限速 */
export async function unlockSession(password: string) { return parsePlatform('LockState', await write('/api/v1/auth/unlock', 'POST', { password })); }

/** @returns 当前企业用户与主部门关联；需member.read和department.read，失败拒绝显示部门筛选结果而非当作无部门 */
export async function listMemberDirectory() { const value = await request('/api/v1/departments/member-directory'); if (!Array.isArray(value)) throw new ApiFailure(0, '成员部门响应格式错误'); return value.map((row) => parsePlatform('MemberDirectory', row)); }
