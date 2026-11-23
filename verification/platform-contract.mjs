/** 平台公开视图生成器；源JSON Schema维护职责与字段说明，支持必填字段、字符串数组、已声明对象引用数组及显式开放的元数据对象；不支持的结构显式拒绝。 */
import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../packages/contracts/src/platform.schema.json', import.meta.url), 'utf8'));
let output = '/** 自动生成的平台响应类型；源 platform.schema.json，禁止直接修改。 */\n';
for (const [name, schema] of Object.entries(source.$defs)) {
  if (schema.type !== 'object' || schema.additionalProperties !== false || schema.required.length !== Object.keys(schema.properties).length) throw new Error('生成器仅支持所有字段必填的平面对象');
  output += `/** ${schema.description} */\nexport interface ${name} {\n`;
  for (const [key, field] of Object.entries(schema.properties)) {
    const reference = field.items?.$ref?.match(/^#\/\$defs\/([A-Za-z][A-Za-z0-9]*)$/)?.[1];
    if (!['string', 'boolean', 'integer', 'array', 'object'].includes(field.type) || (field.type === 'object' && field.additionalProperties !== true) || (field.type === 'array' && field.items?.type !== 'string' && !(reference && source.$defs[reference]))) throw new Error('不支持的字段类型');
    output += `  /** ${field.description} */\n  ${key}: ${field.enum ? field.enum.map((value) => JSON.stringify(value)).join(' | ') : field.type === 'array' ? `${reference ?? 'string'}[]` : field.type === 'integer' ? 'number' : field.type === 'object' ? 'Record<string, unknown>' : field.type};\n`;
  }
  output += '}\n';
}
const target = new URL('../packages/contracts/src/platform.generated.ts', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(target, output);
else if (readFileSync(target, 'utf8') !== output) throw new Error('平台视图类型与源Schema不一致，请执行node verification/platform-contract.mjs --write');
