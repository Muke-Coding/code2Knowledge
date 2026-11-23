/** 受控预检子进程入口；只读父进程私有输入，不含设备凭证，退出仅输出源契约清单，不输出异常或宿主目录。 */
import { readPrivate } from './store.js';
import { preflight, failedManifest } from './preflight.js';
/** @returns 单次预检完成；输入错误或执行失败转固定失败清单，无敏感日志 */
async function main(): Promise<void> {
  try {
    if (process.argv.length !== 3 || !process.argv[2]) throw new Error('输入不合法');
    const value: unknown = JSON.parse(readPrivate(process.argv[2])); if (!value || typeof value !== 'object') throw new Error('输入不合法');
    const input = value as Record<string, unknown>;
    if (typeof input.repository !== 'string' || typeof input.branch !== 'string' || typeof input.directory !== 'string') throw new Error('输入不合法');
    console.log(JSON.stringify(await preflight(input.repository, input.branch, input.directory)));
  } catch { console.log(JSON.stringify(failedManifest())); }
}
await main();
