/** 企业身份与目录的真实浏览器验收；仅使用临时数据库和固定合成密码，不向外部系统发送材料。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { parsePlatform } from '@c2k/contracts';

/** @param page 已登录页面 @param title 注册页面名称 @returns 通过工作台入口和原生Tabs切换，不绕过导航权限 */
async function navigate(page: Page, title: string): Promise<void> {
  const group = ['逆向任务', '预检任务'].includes(title) ? '逆向工作台' : '知识工作台';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: group, exact: true }).click();
  await page.getByRole('tab', { name: title, exact: true }).click();
}
/** @param page 已登录页面 @returns 通过真实父菜单点击展开可用入口；不修改组件状态或权限。 */
async function expandNavigation(page: Page): Promise<void> {
  const parents = page.getByRole('navigation', { name: '主导航' }).locator('.ant-menu-submenu-title[aria-expanded="false"]');
  while (await parents.count()) await parents.first().click();
}
/**
 * 使用真实登录表单，不注入身份、Cookie或模拟接口。
 * @param page 当前隔离浏览器页面，不为空。
 * @param username 测试账户登录名，默认引导管理员。
 * @returns 登录并进入系统目录后完成，无业务返回。
 */
async function login(page: Page, username = 'admin'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('登录名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026');
  await submitLogin(page);
  await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); await expandNavigation(page);
}
/**
 * 验证页面无水平溢出并保存稳定截图；表格内部滚动不算页面溢出。
 * @param page 当前页面，不为空。
 * @param name 截图名称，仅使用合成测试名，不含身份秘密。
 * @returns 截图完成，无业务返回。
 */
async function screenshot(page: Page, name: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/platform/${name}.png`, animations: 'disabled', fullPage: true });
}
for (const width of [380, 900, 1440]) {
  test(`${width}px真实登录和空列表键盘布局`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
    await screenshot(page, `login-${width}`);
    await login(page);
    await expect(page.getByText('0 个系统', { exact: true })).toBeVisible(); await expect(page.locator('.ant-pagination')).toHaveCount(0);
    const add = page.getByRole('button', { name: '登记系统', exact: true }).first();
    await add.focus(); await expect(add).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '登记系统' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await screenshot(page, `empty-systems-${width}`);
  });
}
test('管理员建成员/系统/授权，成员刷新后可见，撤权后404，停用旧会话失效', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const sessionResponse = await page.request.get('/api/v1/auth/session');
  expect(parsePlatform('Session', await sessionResponse.json()).role).toBe('ADMIN');
  await page.getByRole('link', { name: '成员', exact: true }).click();
  await page.getByRole('button', { name: '添加成员', exact: true }).click();
  await page.getByLabel('显示名称', { exact: true }).fill('验收成员');
  await page.getByLabel('登录名', { exact: true }).fill('acceptance-member');
  await page.getByLabel('初始密码', { exact: true }).fill('Test-Only-Password-2026');
  await page.getByRole('button', { name: '创建成员', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('acceptance-member', { exact: true })).toBeVisible();
  await screenshot(page, 'members-1440');
  await navigate(page, '系统目录');
  await page.getByRole('button', { name: '登记系统', exact: true }).first().click();
  const systemName = '采购协同中心—跨系统目录验收';
  await page.getByLabel('系统名称', { exact: true }).fill(systemName);
  await page.getByLabel('描述', { exact: true }).fill('合成验收目录，不含客户业务信息。'.repeat(18));
  await page.getByRole('button', { name: '创建系统', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: systemName, exact: true })).toBeVisible();
  const systemsResponse = await page.request.get('/api/v1/systems');
  const systems = await systemsResponse.json();
  const system = parsePlatform('CatalogSystem', systems[0]);
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' });
  const member = await memberContext.newPage();
  try {
    const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
    const createdMember = (await (await page.request.get('/api/v1/members')).json() as unknown[]).map((value) => parsePlatform('Member', value)).find((value) => value.username === 'acceptance-member')!;
    const readRole = parsePlatform('Role', await (await page.request.post('/api/v1/roles', { headers: { [csrf.headerName]: csrf.token }, data: { name: '显式目录读取', permissions: ['catalog.read'] } })).json());
    expect((await page.request.put(`/api/v1/members/${createdMember.id}/roles`, { headers: { [csrf.headerName]: csrf.token }, data: { revision: 0, roleIds: [readRole.id] } })).status()).toBe(204);
    await login(member, 'acceptance-member');
    await expect(member.getByText('暂无可访问的系统')).toBeVisible();
    await expect(member.getByRole('link', { name: '成员', exact: true })).toHaveCount(0);
    expect((await member.request.get('/api/v1/members')).status()).toBe(403);
    expect((await member.request.get(`/api/v1/systems/${system.id}`)).status()).toBe(404);
    await page.getByRole('button', { name: `${systemName}目录权限` }).click();
    await page.getByRole('combobox', { name: '选择授权成员' }).click();
    await page.getByText('验收成员 (acceptance-member)', { exact: true }).click();
    await page.getByRole('button', { name: '授权', exact: true }).click();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible();
    await screenshot(page, 'grants-1440');
    await member.getByRole('button', { name: '刷新系统', exact: true }).click();
    await expect(member.getByRole('button', { name: systemName, exact: true })).toBeVisible();
    expect(parsePlatform('CatalogSystem', await (await member.request.get(`/api/v1/systems/${system.id}`)).json()).id).toBe(system.id);
    await member.getByRole('button', { name: systemName, exact: true }).click();
    await expect(member.getByRole('dialog')).toBeVisible();
    await expect(member.getByRole('heading', { name: '目录读取权限' })).toHaveCount(0);
    await member.keyboard.press('Escape');
    for (const width of [380, 900, 1440]) {
      await page.setViewportSize({ width, height: width === 380 ? 620 : 900 });
      await page.getByRole('dialog').getByRole('button', { name: '撤销', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('dialog').getByRole('button', { name: '撤销', exact: true })).toBeInViewport();
      await screenshot(page, `grants-${width}`);
    }
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).last().click();
    await expect(page.getByText('尚未授权成员', { exact: true })).toBeVisible();
    await member.getByRole('button', { name: '刷新系统', exact: true }).click();
    await expect(member.getByText('暂无可访问的系统')).toBeVisible();
    expect((await member.request.get(`/api/v1/systems/${system.id}`)).status()).toBe(404);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('link', { name: '成员', exact: true }).click();
    await page.getByRole('button', { name: '停用', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByText('已停用', { exact: true })).toBeVisible();
    await member.reload();
    await expect(member.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
  } finally { await memberContext.close(); }
});
test('错误密码可重试，刷新保留会话，列表网络失败不显示旧数据', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('登录名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('登录名或密码错误');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
  await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); await expandNavigation(page);
  await page.reload(); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(page);
  await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); await expandNavigation(page);
  await page.route('**/api/v1/systems', (route) => route.abort());
  await page.getByRole('button', { name: '刷新系统', exact: true }).click();
  await expect(page.getByText('无法连接平台，请确认服务已启动后重试', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.unroute('**/api/v1/systems');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
});
