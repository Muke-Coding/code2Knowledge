/** 真实 Java/Web/Runtime 最小联通验收；不模拟接口，不代表登录、数据库和逆向闭环已实现。 */
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
test('Web 经开发代理访问真实 Java，CLI 使用相同契约，其他接口拒绝匿名访问', async ({ page, request }) => {
  await page.goto('/diagnostics');
  await expect(page.getByText('基础服务可达', { exact: true })).toBeVisible();
  const health = await request.get('http://127.0.0.1:18080/actuator/health');
  expect(await health.json()).toEqual({ status: 'UP' });
  expect((await request.get('http://127.0.0.1:18080/api/v1/systems')).status()).toBe(403);
  expect((await request.get('http://127.0.0.1:18080/actuator/env')).status()).toBe(403);
  const result = execFileSync(process.execPath, ['apps/runtime/dist/cli.js', 'doctor', '--server', 'http://127.0.0.1:18080'], { encoding: 'utf8', timeout: 10000 });
  expect(JSON.parse(result)).toEqual({ nodeSupported: true, platform: 'up' });
});
