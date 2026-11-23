/** 账户工具异常与深色业务页验收；网络和浏览器拒绝只注入失败，不伪造成功或真实模型质量。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
/** @param page 隔离页面 @returns 使用测试库管理员登录 */
async function login(page: Page): Promise<void> { await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); }
/** @param page 真实页面 @param name 无秘密截图名 @returns 保存失败/主题状态且核对无水平溢出 */
async function capture(page: Page, name: string): Promise<void> { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, fullPage: true, animations: 'disabled' }); }

test('个人资料加载失败可重试，锁屏失败保留业务页，深色表格和键盘账户菜单', async ({ page }) => {
  test.setTimeout(60000); await login(page); await page.route('**/api/v1/profile', (route) => route.abort('failed')); await page.goto('/profile'); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('显示名称', { exact: true })).toHaveCount(0); await capture(page, 'profile-load-error'); await page.unroute('**/api/v1/profile'); await page.getByRole('button', { name: '重新加载', exact: true }).click(); await expect(page.getByLabel('显示名称', { exact: true })).toBeVisible();
  await page.route('**/api/v1/auth/lock', (route) => route.abort('failed')); await page.getByRole('button', { name: '账户菜单', exact: true }).click(); await page.getByRole('menuitem', { name: '锁定屏幕', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '屏幕已锁定', exact: true })).toHaveCount(0); await page.unroute('**/api/v1/auth/lock');
  await page.goto('/sources'); await expect(page.getByRole('heading', { name: '来源管理', exact: true })).toBeVisible(); await page.getByRole('button', { name: '切换深色', exact: true }).click();
  for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `sources-dark-${width}`); }
  await page.getByRole('button', { name: '账户菜单', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('menuitem', { name: '个人中心', exact: true })).toBeVisible(); await capture(page, 'account-dropdown-dark'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await expect(page.getByRole('menuitem', { name: '个人中心', exact: true })).not.toBeVisible();
});

test('浏览器拒绝全屏时提供恢复提示，不支持时禁用操作', async ({ page }) => {
  await login(page); await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('合成浏览器权限拒绝')); }); await page.getByRole('button', { name: '进入全屏', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('浏览器未允许全屏'); expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false); await capture(page, 'fullscreen-rejected');
  await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); }); await page.reload(); await expect(page.getByRole('button', { name: '进入全屏', exact: true })).toBeDisabled();
});

/** @param color 浏览器计算出的不透明RGB颜色 @returns WCAG相对亮度，0至1 @throws {Error} 不支持的颜色格式阻止验收而非忽略 */
function luminance(color: string): number { const values = color.match(/[\d.]+/g)?.map(Number); if (!values || values.length < 3 || (values[3] !== undefined && values[3] !== 1)) throw new Error('对比度验收要求不透明RGB'); const rgb = values.slice(0, 3).map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4); }); return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722; }
/** @param foreground 实际前景色 @param background 实际背景色 @returns WCAG对比度比例，不判断装饰或禁用状态 */
function contrast(foreground: string, background: string): number { const first = luminance(foreground), second = luminance(background); return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05); }

test('深浅色主要按钮、标签和激活页签满足正文对比度', async ({ page }) => {
  await login(page); await page.goto('/profile'); await expect(page.getByLabel('显示名称', { exact: true })).toBeVisible();
  for (const dark of [false, true]) {
    if (dark) await page.getByRole('button', { name: '切换深色', exact: true }).click();
    const button = page.getByRole('button', { name: '保存资料', exact: true }); await button.focus();
    const colors = await button.evaluate((element) => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor })); expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    const background = await page.locator('.profile-editor').evaluate((element) => getComputedStyle(element).backgroundColor); await expect.poll(async () => contrast(await page.getByRole('tab', { name: '基本资料', exact: true }).evaluate((element) => getComputedStyle(element).color), background)).toBeGreaterThanOrEqual(4.5);
    const label = await page.locator('.profile-summary .ant-descriptions-item-label').first().evaluate((element) => getComputedStyle(element).color); expect(contrast(label, background)).toBeGreaterThanOrEqual(4.5);
  }
});
