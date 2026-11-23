/** 设备诊断失败关闭测试；本轮没有执行任务，因此不冒充运行时业务闭环验收。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { diagnose } from './doctor.js';

test('未配置平台时不联网，并准确报告 Node 范围', async () => {
  assert.deepEqual(await diagnose(undefined, '22.16.0'), { nodeSupported: true, platform: 'not_checked' });
  assert.equal((await diagnose(undefined, '20.0.0')).nodeSupported, false);
});
test('拒绝凭证、查询参数与非 HTTP 服务地址', async () => {
  for (const url of ['http://user:pass@localhost', 'http://localhost/?key=fixture', 'file:///tmp/a', 'http://localhost/private']) {
    await assert.rejects(diagnose(url));
  }
});
test('真实 HTTP 成功和非契约响应得到不同诊断', async () => {
  let body = '{"status":"UP"}';
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(body); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const origin = `http://127.0.0.1:${address.port}`;
    assert.equal((await diagnose(origin)).platform, 'up');
    body = '{"status":"UP","secret":"fixture"}';
    assert.equal((await diagnose(origin)).platform, 'unavailable');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
