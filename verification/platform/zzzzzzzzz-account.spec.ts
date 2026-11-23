/** 账户自助与顶部工具真实浏览器验收；仅创建隔离合成成员，不更改管理员凭证或使用模型。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { parsePlatform } from '@c2k/contracts';
/** 测试专用初始密码，禁止部署使用。 */
const password = 'Test-Only-Password-2026';
/** @param page 隔离浏览器页面 @param username 合成登录名 @param secret 测试凭证 @returns 服务端认证且主导航可用 */
async function login(page: Page, username = 'admin', secret = password): Promise<void> { await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill(secret); await submitLogin(page); await expect(page.getByRole('button', { name: '账户菜单', exact: true })).toBeVisible(); }
/** @param page 已登录页面 @param action 顶部账户操作 @returns 通过AntD原生下拉项执行，不绕过界面 */
async function account(page: Page, action: string): Promise<void> { await page.getByRole('button', { name: '账户菜单', exact: true }).click(); await page.getByRole('menuitem', { name: action, exact: true }).click(); }
/** @param page 当前页面 @param name 无凭证截图名 @returns 检查水平溢出并保存真实截图 */
async function capture(page: Page, name: string): Promise<void> { await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, fullPage: true, animations: 'disabled', maskColor: '#cbd5e1', mask: [page.locator('input[type="password"]')] }); }
/** @param page 已登录管理员 @param username 合成用户名 @returns 新成员创建成功，不输出响应秘密 */
async function member(page: Page, username: string): Promise<void> { const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json()); const response = await page.request.post('/api/v1/members', { headers: { [csrf.headerName]: csrf.token }, data: { username, displayName: '账户自助验收成员', password } }); expect(response.status()).toBe(201); }

test('顶部工具、个人资料、深浅色持久化、原生全屏与三种窗口视觉', async ({ page }) => {
  test.setTimeout(90000); await login(page); await account(page, '个人中心'); await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible(); await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue('管理员');
  await page.getByLabel('显示名称', { exact: true }).fill('账户工具验收管理员'); await page.getByRole('button', { name: '保存资料', exact: true }).click(); await expect(page.getByRole('status')).toContainText('个人资料已保存'); await expect(page.locator('.account-trigger-name')).toHaveText('账户工具验收管理员');
  for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `profile-light-${width}`); expect((await page.locator('.account-trigger .ant-avatar').boundingBox())!.width).toBeGreaterThanOrEqual(28); if (width > 850) await expect(page.locator('.account-trigger-name')).toBeVisible(); }
  await page.getByRole('button', { name: '切换深色', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue('账户工具验收管理员');
  for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `profile-dark-${width}`); }
  await page.getByRole('button', { name: '进入全屏', exact: true }).click(); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true); await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible(); await page.evaluate(() => document.exitFullscreen()); await expect(page.getByRole('button', { name: '进入全屏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '账户菜单', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('menuitem', { name: '锁定屏幕', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
  await page.getByLabel('显示名称', { exact: true }).fill('管理员'); await page.getByRole('button', { name: '保存资料', exact: true }).click(); await expect(page.locator('.account-trigger-name')).toHaveText('管理员'); await page.getByRole('button', { name: '切换浅色', exact: true }).click();
});

test('服务端锁屏、同会话标签页、刷新、错误密码、解锁和锁屏退出', async ({ page, context }) => {
  test.setTimeout(90000); await login(page); const second = await context.newPage(); await second.goto('/profile'); await expect(second.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible();
  await account(page, '锁定屏幕'); await expect(page.getByRole('heading', { name: '屏幕已锁定', exact: true })).toBeVisible(); expect((await page.request.get('/api/v1/profile')).status()).toBe(423); await second.reload(); await expect(second.getByRole('heading', { name: '屏幕已锁定', exact: true })).toBeVisible(); await page.reload(); await expect(page.getByRole('heading', { name: '屏幕已锁定', exact: true })).toBeVisible(); await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0);
  for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `lock-light-${width}`); }
  await page.getByLabel('解锁密码', { exact: true }).fill('Wrong-Password-2026'); await page.getByRole('button', { name: '解锁', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('密码不正确'); await expect(page.getByLabel('解锁密码', { exact: true })).toHaveValue(''); expect((await page.request.get('/api/v1/auth/session')).status()).toBe(423);
  await page.getByLabel('解锁密码', { exact: true }).fill(password); await page.getByRole('button', { name: '解锁', exact: true }).click(); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); await second.reload(); await expect(second.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible(); await second.close();
  await page.getByRole('button', { name: '切换深色', exact: true }).click(); await account(page, '锁定屏幕'); await expect(page.getByRole('heading', { name: '屏幕已锁定', exact: true })).toBeVisible(); await capture(page, 'lock-dark-1440'); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible(); expect((await page.request.get('/api/v1/profile')).status()).toBe(401);
});

test('无业务角色成员可自助改密；错误不退出，成功使另一浏览器旧会话失效', async ({ page, browser }) => {
  test.setTimeout(90000); await login(page); const username = `account-${Date.now()}`; await member(page, username); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible(); await login(page, username); await account(page, '个人中心');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' }); const otherPage = await other.newPage();
  try {
    await login(otherPage, username); await page.getByRole('tab', { name: '修改密码', exact: true }).click(); await page.getByLabel('当前密码', { exact: true }).fill('Wrong-Password-2026'); await page.getByLabel('新密码', { exact: true }).fill('Changed-Only-Password-2026'); await page.getByLabel('确认新密码', { exact: true }).fill('Changed-Only-Password-2026'); await page.getByRole('button', { name: '修改密码并重新登录', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: '当前密码不正确' })).toBeVisible(); await expect(page.getByLabel('当前密码', { exact: true })).toHaveValue('');
    await page.getByLabel('当前密码', { exact: true }).fill(password); await page.getByLabel('新密码', { exact: true }).fill('Changed-Only-Password-2026'); await page.getByLabel('确认新密码', { exact: true }).fill('Changed-Only-Password-2026'); await page.getByRole('button', { name: '修改密码并重新登录', exact: true }).click(); await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible(); await expect(page.getByRole('status')).toContainText('密码已修改'); expect((await otherPage.request.get('/api/v1/profile')).status()).toBe(401); await otherPage.reload(); await expect(otherPage.getByRole('button', { name: '登录', exact: true })).toBeVisible(); await login(page, username, 'Changed-Only-Password-2026'); await account(page, '个人中心'); await expect(page.getByRole('heading', { name: '个人中心', exact: true })).toBeVisible();
  } finally { await other.close(); }
});
