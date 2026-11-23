/** 中文文档门禁自身的回归测试；用隔离语法片段验证漏检和误报，不执行被检查代码。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { check } from './check-comments.mjs';

/**
 * 解析独立片段并检查，避免依赖工作区文件或副作用。
 * @param {string} source 待检查的完整片段，不能为空。
 * @returns {string[]} 违规列表；空数组表示通过静态门禁。
 */
function inspect(source) {
  return check(ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true));
}
test('箭头变量与类属性函数都要求真实参数和返回文档', () => {
  assert.match(inspect('/** 计算模块 */\n/** 加一 */\nexport const add = (amount:number):number => amount+1;').join(), /缺少参数文档/);
  assert.match(inspect('/** 计算模块 */\n/** 服务职责 */\nclass Service { calculate=(amount:number):number=>amount+1; }').join(), /缺少中文文档说明/);
  assert.deepEqual(inspect('/** 计算模块 */\n/** 加一\n * @param amount 输入数值，不为空。\n * @returns 加一结果，不为空。\n */\nexport const add=(amount:number):number=>amount+1;'), []);
});
test('模块中文必须位于首个文档注释中，不能借用字符串中文', () => {
  assert.match(inspect('/** English only. */ console.log("中文文本");').join(), /缺少模块中文职责/);
  assert.deepEqual(inspect('/** 中文模块职责 */ console.log("ready");'), []);
});
