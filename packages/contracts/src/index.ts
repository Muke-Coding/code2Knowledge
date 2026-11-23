/** 跨 Web 与设备共用的健康响应契约；源 Schema 不含任何身份或业务能力声明。 */
import Ajv from 'ajv';
import schema from './health.schema.json' with { type: 'json' };

import type { HealthResponse } from './health.generated.js';
export type { HealthResponse } from './health.generated.js';

/** 权威健康 JSON Schema，校验行为变更必须同时更新该源契约及兼容测试。 */
export const healthSchema = schema;
const validator = new Ajv.default({ strict: true }).compile<HealthResponse>(healthSchema);

/**
 * 对不可信 HTTP 响应执行源契约校验，不接受额外信息泄露字段。
 * @param value 未经校验的 JSON 值，允许 null 输入但不会通过校验。
 * @returns 合法时返回同一响应对象；不返回 null。
 * @throws {Error} 字段缺失、状态无效或包含额外字段时抛出。
 */
export function parseHealthResponse(value: unknown): HealthResponse {
  if (!validator(value)) throw new Error('服务响应不符合健康契约');
  return value;
}

/**
 * 有界读取公开健康 JSON，防止不可信服务无限响应耗尽诊断端内存。
 * @param response 已获取的 HTTP 响应，必须成功且有可读取正文，不可为 null。
 * @returns 源契约校验后的健康响应，不返回 null。
 * @throws {Error} 状态失败、正文超 4096 字节、JSON 或契约无效时抛出。
 */
export async function readHealthResponse(response: Response): Promise<HealthResponse> {
  if (!response.ok || !response.body) throw new Error('健康响应失败');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) throw new Error('健康响应超过大小限制');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseHealthResponse(JSON.parse(new TextDecoder().decode(bytes)));
}
export * from './platform.js';
export * from './permissions.js';
