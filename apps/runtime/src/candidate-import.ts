/** 显式ZIP导入客户端；不启动daemon任务、不调用模型，所有来源需本机许可且提交前平台重新授权。 */
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { readDevice } from './store.js';
import { documentBinding } from './document-bindings.js';
import { sourceBinding } from './source-bindings.js';
import { serverOrigin } from './connection.js';
import { readSkillBytes } from './skill-adapter.js';
import { randomUUID } from 'node:crypto';
/** 本地显式仓库映射文件；平台仍以当前ACL为准，不接受映射文件授予权限。 */
interface ImportBinding {
  /** 平台来源UUID。 */
  sourceId: string;
  /** 当前配置版本，与本机许可一致。 */
  revision: number;
  /** 来源类别；省略时兼容既有code映射。 */
  kind?: 'code' | 'document';
  /** 文档相对路径，code省略或空。 */
  path?: string;
  /** Skill中来源名，资料使用document_id，不为路径。 */
  repository: string;
  /** 包内来源完整commit。 */
  commit: string;
}
/**
 * 导入既有Skill资产，不证明设备实际读取过包内声明commit；平台独立校验全部来源及资产。
 * @param home 已配对私有设备目录
 * @param archive ZIP路径，最大8MiB，最终节点不得为链接
 * @param mapping 本地显式绑定JSON文件，最多128KiB，不读取Git或凭证代理
 * @param requestId 用户重试沿用的UUID；未指定生成一次并在提交前输出，不含秘密
 * @returns 接收成功后仅输出候选ID，不输出正文/路径/凭证
 * @throws {Error} 许可、输入或HTTP失败固定提示，不打印原始响应
 */
export async function importCandidate(home: string, archive: string, mapping: string, requestId: string = randomUUID()): Promise<void> {
  const device = readDevice(home); const raw = await boundedFile(mapping, 131072);
  const bindings = JSON.parse(raw.toString('utf8')) as ImportBinding[];
  if (!Array.isArray(bindings) || !bindings.length || bindings.length > 128) throw new Error('bindings');
  for (const value of bindings) { const permit = value.kind === 'document' ? documentBinding(home, value.sourceId) : sourceBinding(home, value.sourceId); if (!permit || permit.revision !== value.revision) throw new Error('permit'); }
  // 先运行固定纯契约内核；服务端不会信任本地成功，而是对收到的原包再次校验。
  const bytes = await boundedFile(archive, 8388608);
  await readSkillBytes(bytes);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId)) throw new Error('request');
  // 校验可能耗时；提交前再次核对本机许可，已撤销或版本变化不继续上传。
  for (const value of bindings) { const permit = value.kind === 'document' ? documentBinding(home, value.sourceId) : sourceBinding(home, value.sourceId); if (!permit || permit.revision !== value.revision) throw new Error('permit'); }
  console.log(`导入请求ID：${requestId}；失败重试请沿用此ID`);
  const form = new FormData(); form.set('requestId', requestId); form.set('bindings', JSON.stringify(bindings)); form.set('archive', new Blob([new Uint8Array(bytes)]), 'knowledge.zip');
  const response = await fetch(serverOrigin(device.server) + '/runtime/v1/candidates', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${device.token}` }, body: form });
  if (response.status !== 201) { await response.body?.cancel(); throw new Error('rejected'); }
  const reader = response.body?.getReader(); if (!reader) throw new Error('response');
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 4096) throw new Error('response'); chunks.push(next.value); } } finally { await reader.cancel(); }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  if (typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/.test(result.id)) throw new Error('response');
  console.log(`候选已导入：${result.id}；仅本人可读，未审核、未发布`);
}

/**
 * 显式文件按打开时长度读取，拒绝增长、截断和链接，避免readFile在检查后无限分配。
 * @param path 用户明确选择的本地普通文件
 * @param limit 最大原始字节数
 * @returns 同一文件描述符取得的有界快照，不含额外字节
 * @throws {Error} 文件类型、长度或读取期间变化时拒绝
 */
async function boundedFile(path: string, limit: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > limit) throw new Error('file');
    const bytes = Buffer.alloc(stat.size + 1); let offset = 0;
    while (offset < bytes.length) { const value = await handle.read(bytes, offset, bytes.length - offset, offset); if (!value.bytesRead) break; offset += value.bytesRead; }
    if (offset !== stat.size) throw new Error('changed'); return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
