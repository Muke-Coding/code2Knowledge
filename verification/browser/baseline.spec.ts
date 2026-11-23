/** Web 诊断功能与布局验收；模拟健康响应只证明视图行为，不代表身份/任务已实现。 */
import { test, expect } from '@playwright/test';

for (const width of [380, 900, 1440]) {
  test(`健康状态与${width}px布局无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 });
    await page.route('**/actuator/health', (route) => route.fulfill({ json: { status: 'UP' } }));
    await page.goto('/diagnostics');
    await expect(page.getByText('基础服务可达', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新检查' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '重新检查' }).focus();
    await expect(page.getByRole('button', { name: '重新检查' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: '重新检查' })).toBeEnabled();
    await expect(page.getByText('基础服务可达', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新检查' })).not.toHaveClass(/loading/);
    await page.screenshot({ animations: 'disabled', path: `test-results/diagnostic-${width}.png`, fullPage: true });
  });
}
test('失败可重试，错误字段不能伪装成功', async ({ page }) => {
  let valid = false;
  await page.route('**/actuator/health', (route) => route.fulfill({ json: valid ? { status: 'UP' } : { status: 'UP', unexpected: true } }));
  await page.goto('/diagnostics');
  await expect(page.getByText('基础服务不可达', { exact: true })).toBeVisible();
  valid = true;
  await page.getByRole('button', { name: '重新检查' }).click();
  await expect(page.getByText('基础服务可达', { exact: true })).toBeVisible();
});
test('等待响应期间显示加载并禁止重复操作', async ({ page }) => {
  await page.route('**/actuator/health', async (route) => { await new Promise((resolve) => setTimeout(resolve, 500)); await route.fulfill({ json: { status: 'UP' } }); });
  await page.goto('/diagnostics');
  await expect(page.getByText('正在检查基础服务')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新检查' })).toHaveClass(/loading/);
  await expect(page.getByText('基础服务可达', { exact: true })).toBeVisible();
});
