/** 健康响应类型生成器；仅处理当前单状态字段契约，不作为通用 JSON Schema 转换器。 */
import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../packages/contracts/src/health.schema.json', import.meta.url), 'utf8'));
if (source.type !== 'object' || source.additionalProperties !== false || JSON.stringify(source.required) !== '["status"]' || Object.keys(source.properties).join() !== 'status' || !source.properties.status.enum.every((value) => typeof value === 'string')) throw new Error('契约超出生成器支持范围，须同步扩展生成器');
const output = `/** 自动生成：来源 health.schema.json；通过 verification/health-contract.mjs 维护，禁止手改。 */\n/** 进程健康响应，供 Web 与设备诊断共用，不代表业务就绪。 */\nexport interface HealthResponse {\n  /** ${source.properties.status.description} */\n  status: ${source.properties.status.enum.map((value) => JSON.stringify(value)).join(' | ')};\n}\n`;
const path = new URL('../packages/contracts/src/health.generated.ts', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(path, output);
else if (readFileSync(path, 'utf8') !== output) throw new Error('健康类型与源 Schema 不一致，请执行 node verification/health-contract.mjs --write');
