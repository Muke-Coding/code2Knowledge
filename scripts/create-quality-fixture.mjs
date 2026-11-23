/** 真实模型质量验收的合成业务原料生成器；不读取客户配置、不调用模型，核对答案留在材料目录外，防止作为模型输入泄漏。 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * 新建独立合成仓库，不更改已有Git目录，不安装或执行样例业务代码。
 * @param {string} root 新建根，必须不存在
 * @param {string} name 仓库名，只用脚本固定值
 * @param {string} content 合成代码，无客户内容与凭证
 * @returns {void} main分支提交与原始代码落盘
 * @throws {Error} 创建或Git失败时停止，保留已生成部分供检查
 */
function repository(root, name, content) {
  const directory = join(root, name); mkdirSync(directory, { mode: 0o700 });
  writeFileSync(join(directory, 'service.ts'), content, { mode: 0o600 });
  execFileSync('git', ['init', '-q', '-b', 'main', directory], { stdio: 'ignore' });
  execFileSync('git', ['-C', directory, 'add', 'service.ts'], { stdio: 'ignore' });
  execFileSync('git', ['-C', directory, '-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-qm', '建立合成验收原料'], { stdio: 'ignore' });
}
const root = process.argv[2];
if (!root || !isAbsolute(root) || existsSync(root)) throw new Error('请传入尚不存在的绝对输出目录');
mkdirSync(root, { recursive: true, mode: 0o700 });
repository(root, 'orders', `/** 合成订单模块；只允许已付款订单发起退款，金额单位分，不代表客户业务。 */
export interface Order {
  /** 订单稳定标识。 */
  id: string;
  /** 已付款或已关闭，不接受其他状态。 */
  state: 'PAID' | 'CLOSED';
  /** 已付款金额，单位分。 */
  paid: number;
  /** 已退款金额，单位分。 */
  refunded: number;
}
/** @param order 当前订单 @param cents 申请金额，单位分 @returns 支付命令，尚未记账 @throws {Error} 状态不支持、金额不为正整数或超过剩余可退金额 */
export function requestRefund(order: Order, cents: number) {
  if (order.state !== 'PAID') throw new Error('ORDER_STATE');
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > order.paid - order.refunded) throw new Error('REFUND_AMOUNT');
  return { orderId: order.id, cents, event: 'refund.requested' };
}
`);
repository(root, 'payments', `/** 合成支付模块；事件处理不等于下游库存已完成，存储接口必须自行保证事务性。 */
export interface Ledger {
  /** @param eventId 幂等事件标识 @returns 已入账为true */
  exists(eventId: string): boolean;
  /** @param eventId 当前事件标识 @param cents 退款金额，单位分 @returns 写入完成，事务性取决于实际适配器 */
  append(eventId: string, cents: number): void;
}
/** @param eventId 幂等键 @param cents 已校验金额，单位分 @param ledger 账本接口 @returns 重复事件不产生下游事件；新事件发出库存释放请求，不证明已释放 */
export function recordRefund(eventId: string, cents: number, ledger: Ledger) {
  if (ledger.exists(eventId)) return [];
  ledger.append(eventId, cents);
  return [{ type: 'inventory.release.requested', eventId }];
}
`);
const docs = join(root, 'documents'); mkdirSync(docs, { mode: 0o700 });
writeFileSync(join(docs, 'PRD.md'), '# 合成退款需求 v2（设计意图）\n申请退款金额允许为零；订单关闭后仍允许退款。支付退款完成后库存必须立即释放。以上是需求意图，需与实现核对。\n', { mode: 0o600 });
writeFileSync(join(docs, 'ERD.md'), '# 合成退款关系\nOrder(id, paid_cents, refunded_cents)；RefundEvent(event_id, order_id, cents)。Order 与 RefundEvent 为一对多。该文档不证明数据库已建表，也未提供真实唯一约束。\n', { mode: 0o600 });
writeFileSync(join(root, 'ACCEPTANCE.md'), `# 真实模型人工核对单（禁止作为原料上传）

平台登记两个REPOSITORY来源，分支main，分别绑定orders、payments；登记DOCUMENT来源，定位PRD.md以及ERD.md时可各登记一项并绑定同一documents根。选择两个仓库及两项资料，业务范围填写“退款准入、支付幂等及库存事件，区分代码现状与设计冲突”。模型仍只在专用运行时本机配置。

逐项记为通过/失败/未找到，并记录产物路径及证据行；结构校验通过不替代下列核对：

1. 订单只允许PAID，CLOSED拒绝；不得采用PRD的相反规则冒充已实现。
2. 金额单位为分，必须为正的安全整数且不超过paid-refunded。
3. 订单模块返回refund.requested命令，不把它写成已退款入账。
4. 支付通过eventId检查已存在；重复返回空事件列表。
5. exists与append分开调用，未证明数据库事务或并发唯一性；不得声称exactly-once。
6. 新支付事件返回inventory.release.requested；没有库存消费者代码，不能确认库存已释放。
7. 显式指出PRD与代码的零金额、关闭订单及立即释放三项冲突。
8. ERD是设计关系，不能据此声称真实表、FK或唯一索引已验证。
9. 代码映射指向正确仓库别名、固定commit及真实service.ts行号；文档证据独立标明。
10. graph/mapping/ontology引用无悬空ID，业务条目保留待审核，不自动confirmed。

验收结论由业务审核人填写；这十项用于发现错误与遗漏，不设置未经确认的自动商业准入分数。候选通过质量核对后再进入既有自己审核/指定审核人流程。本脚本未执行模型。
`, { mode: 0o600 });
console.log('已生成合成验收原料：' + resolve(root));
