/** 共享内核候选清单构造；执行端和服务端子进程共用预算，模板预估不替代最终原包校验。 */
import { parseAsset } from '@code2knowledge/reverse-kernel';
import { parsePlatform, type CandidateReport } from '@c2k/contracts';
import type { KnowledgeFile } from './skill-adapter.js';
/** 各层候选清单最大128KiB，Java接收方同步限制；来源不可截断。 */
export const REPORT_BYTE_LIMIT = 131072;
/** @param files 完整资产或固定模板，调用方负责原包完整性校验 @param digest 全部资产SHA摘要，模板预算使用固定64字符占位 @returns 固定公开清单，不输出正文 @throws {Error} 元数据不符契约或超过各层统一128KiB预算 */
export async function skillReport(files: KnowledgeFile[], digest: string): Promise<CandidateReport> {
  const assets = files.map((file) => ({ path: file.path, sha256: file.sha256, bytes: Buffer.byteLength(file.content), meta: parseAsset(file.path, file.content).meta }));
  // skillVersion沿用1.0.2兼容封套，表示资产格式基线，不声称本次执行了旧Skill入口。
  const result = parsePlatform('CandidateReport', { version: '1', digest, mode: 'IMPORTED', skillVersion: '1.0.2', contractVersion: '2.0', assets });
  if (Buffer.byteLength(JSON.stringify(result)) > REPORT_BYTE_LIMIT) throw new Error('全部来源清单超过128KiB，请减少本次资料数量或路径长度；不会截断来源'); return result;
}
