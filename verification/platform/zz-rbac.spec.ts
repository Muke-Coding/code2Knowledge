/** 真实RBAC浏览器验收；临时数据库内验证角色、成员多角色、资源范围、撤权和失败恢复，所有名称均为合成数据。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { parsePlatform } from '@c2k/contracts';
test.use({ screenshot: 'only-on-failure' });

/** @param page 已登录页面 @returns 通过真实父菜单点击展开可用入口；不修改组件状态或权限。 */
async function expandNavigation(page: Page): Promise<void> {
  const parents = page.getByRole('navigation', { name: '主导航' }).locator('.ant-menu-submenu-title[aria-expanded="false"]');
  while (await parents.count()) await parents.first().click();
}
/** @param page 当前隔离页面。 @param username 合成登录名，默认admin。 @returns 真实登录后进入目录。 */
async function login(page: Page, username = 'admin'): Promise<void> {
  await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page);
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(page);
}
/** @param page 当前页面。 @param name 无敏感信息截图名称。 @returns 检查页面不横向溢出并保存截图。 */
async function screenshot(page: Page, name: string): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/platform/${name}.png`, animations: 'disabled', fullPage: true });
}
/**
 * Ant Design受控组在表单提交状态后更新checked；验证最终状态，不把原生click返回时的瞬态当业务结果。
 * @param page 当前页面，不为空。
 * @param name 动作显示名前缀，来源于已实现目录。
 * @param checked 期望勾选状态。
 * @returns 鼠标操作后等待受控状态与预期一致。
 */
async function choosePermission(page: Page, name: string, checked: boolean): Promise<void> {
  const control = page.getByRole('treeitem').filter({ has: page.locator('.ant-tree-title').getByText(name, { exact: true }) }).getByRole('checkbox').first();
  await expect(control).toBeEnabled();
  if (await control.isChecked() !== checked) await control.click();
  await expect(control).toBeChecked({ checked });
}
for (const width of [380, 900, 1440]) {
  test(`${width}px角色列表和权限抽屉键盘验收`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await login(page);
    await page.getByRole('link', { name: '角色与权限', exact: true }).click();
    await expect(page.getByText('引导管理员', { exact: true })).toBeVisible();
    await screenshot(page, `roles-${width}`);
    const create = page.getByRole('button', { name: '创建角色', exact: true }); await expect(create).toBeEnabled(); await create.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '创建角色', exact: true })).toBeVisible();
    await page.getByLabel('角色名称', { exact: true }).fill('合成授权角色');
    await choosePermission(page, '分配角色', true);
    await expect(page.getByText('角色编辑或分配可委派其他权限，请仅授予可信管理员。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '保存角色', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '保存角色', exact: true })).toBeInViewport();
    await screenshot(page, `role-drawer-${width}`); await page.keyboard.press('Escape'); await page.getByRole('button', { name: '放弃', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(create).toBeFocused();
  });
}
/** @param page 成员列表页 @param username 合成登录名 @returns 找到真实分页中的成员；逐页访问，不假设所有成员在第一页。 */
async function revealMember(page: Page, username: string): Promise<void> {
  const row = page.getByRole('row').filter({ hasText: username });
  await expect(page.getByText(/^\d+ 位成员$/, { exact: true })).toBeVisible();
  await expect(page.locator('.ant-table-tbody > tr[data-row-key]').first()).toBeVisible();
  for (let attempt = 0; attempt < 100 && await row.count() === 0; attempt++) {
    const next = page.locator('.ant-pagination-next');
    await expect(next).not.toHaveClass(/ant-pagination-disabled/); await next.click();
  }
  await expect(row).toBeVisible();
}
test('自定义双角色分配、动作生效、修改与撤销实时拒绝旧会话', async ({ page, browser }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 }); await login(page);
  await page.getByRole('link', { name: '角色与权限', exact: true }).click();
  for (const [name, permission] of [['目录运营角色', '登记系统'], ['成员运营角色', '创建成员']]) {
    await page.getByRole('button', { name: '创建角色', exact: true }).click(); await page.getByLabel('角色名称', { exact: true }).fill(name!);
    await page.getByLabel('职责说明', { exact: true }).fill('合成验收角色，验证实际授权边界。');
    await choosePermission(page, permission!, true);
    await page.getByRole('button', { name: '保存角色', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(name!, { exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: '成员', exact: true }).click(); await page.getByRole('button', { name: '添加成员', exact: true }).click();
  await page.getByLabel('显示名称', { exact: true }).fill('角色验收成员'); await page.getByLabel('登录名', { exact: true }).fill('rbac-member');
  await page.getByLabel('初始密码', { exact: true }).fill('Test-Only-Password-2026'); await page.getByRole('button', { name: '创建成员', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' }); const member = await context.newPage();
  try {
    await login(member, 'rbac-member'); await expect(member.getByText('当前没有可访问的页面', { exact: true })).toBeVisible(); expect((await member.request.get('/api/v1/roles')).status()).toBe(403);
    expect((await member.request.get('/api/v1/members')).status()).toBe(403);
    await revealMember(page, 'rbac-member'); const row = page.getByRole('row').filter({ hasText: 'rbac-member' }); await row.getByRole('button', { name: '分配角色', exact: true }).click();
    const selector = page.getByRole('combobox', { name: '选择成员角色', exact: true });
    for (const name of ['目录运营角色', '成员运营角色']) { await selector.click(); await page.getByText(name, { exact: true }).last().click(); }
    await page.getByRole('dialog').click({ position: { x: 20, y: 100 } }); await page.getByRole('button', { name: '保存分配', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await member.reload(); await expect(member.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(member); await expect(member.getByRole('link', { name: '成员', exact: true })).toBeVisible();
    await expect(member.getByRole('button', { name: '登记系统', exact: true }).first()).toBeVisible();
    await expect(member.getByRole('link', { name: '角色与权限', exact: true })).toHaveCount(0);
    const session = parsePlatform('Session', await (await member.request.get('/api/v1/auth/session')).json()); expect(session.role).toBe('MEMBER'); expect(session.permissions).toEqual(['catalog.create', 'catalog.read', 'catalog.read.all', 'member.create', 'member.read']);
    expect((await member.request.get('/api/v1/members')).status()).toBe(200);
    await page.getByRole('link', { name: '角色与权限', exact: true }).click();
    await page.getByRole('row').filter({ hasText: '成员运营角色' }).getByRole('button', { name: '编辑', exact: true }).click();
    await choosePermission(page, '查看成员', false); await page.getByRole('button', { name: '保存角色', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    // 目录管理员仍可读取成员摘要用于资源授权；撤销member.manage应拒绝的是成员管理写入。
    const memberCsrf = parsePlatform('Csrf', await (await member.request.get('/api/v1/auth/csrf')).json());
    expect((await member.request.post('/api/v1/members', { headers: { [memberCsrf.headerName]: memberCsrf.token }, data: { username: 'blocked-rbac-write', displayName: '应拒绝', password: 'Test-Only-Password-2026' } })).status()).toBe(403);
    expect(parsePlatform('Session', await (await member.request.get('/api/v1/auth/session')).json()).permissions).not.toContain('member.create');
    // 恢复成员窗口焦点但不刷新，验证会话同步会移除已撤销菜单。
    await member.bringToFront();
    await expect(member.getByRole('link', { name: '成员', exact: true })).toHaveCount(0, { timeout: 20000 });
    await page.getByRole('link', { name: '成员', exact: true }).click(); await revealMember(page, 'rbac-member'); await row.getByRole('button', { name: '分配角色', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '选择成员角色', exact: true })).toBeEnabled();
    for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await screenshot(page, `member-roles-${width}`); }
    await selector.focus(); await selector.press('Backspace'); await selector.press('Backspace');
    await page.getByRole('button', { name: '保存分配', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
    const after = parsePlatform('Session', await (await member.request.get('/api/v1/auth/session')).json()); expect(after.permissions).toEqual([]);
    await member.reload(); await expect(member.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(member); await expect(member.getByRole('button', { name: '登记系统', exact: true })).toHaveCount(0);
    await expect(member.getByRole('link', { name: '设备管理', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});
test('角色网络失败不保留旧列表，编辑版本冲突不覆盖', async ({ page }) => {
  await login(page);
  const setupCsrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
  expect((await page.request.post('/api/v1/roles', { headers: { [setupCsrf.headerName]: setupCsrf.token }, data: { name: '冲突验收角色', permissions: ['catalog.read', 'catalog.read.all', 'catalog.create'] } })).status()).toBe(201);
  await page.getByRole('link', { name: '角色与权限', exact: true }).click();
  await expect(page.getByText('冲突验收角色', { exact: true })).toBeVisible();
  await page.route('**/api/v1/roles', (route) => route.abort()); await page.getByRole('button', { name: '刷新角色', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(0); await expect(page.getByRole('alert')).toBeVisible(); await page.unroute('**/api/v1/roles'); await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('row').filter({ hasText: '冲突验收角色' }).getByRole('button', { name: '编辑', exact: true }).click();
  const roles = await (await page.request.get('/api/v1/roles')).json() as unknown[]; const role = roles.map((value) => parsePlatform('Role', value)).find((value) => value.name === '冲突验收角色')!;
  const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
  const response = await page.request.put(`/api/v1/roles/${role.id}`, { headers: { [csrf.headerName]: csrf.token }, data: { name: role.name, description: '另一个窗口已修改', permissions: role.permissions, revision: role.revision } }); expect(response.status()).toBe(200);
  await page.getByRole('button', { name: '保存角色', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('授权已被其他操作修改');
  await expect(page.getByRole('dialog')).toBeVisible(); await screenshot(page, 'role-conflict-1440');
});


test('前后端权限目录不一致时禁用编辑，不静默丢失角色权限', async ({ page }) => {
  await login(page);
  const response = await page.request.get('/api/v1/permissions'); const values: unknown[] = await response.json();
  await page.route('**/api/v1/permissions', (route) => route.fulfill({ json: [...values, { code: 'future.read', name: '未来动作', description: '合成升级不一致场景' }] }));
  await page.getByRole('link', { name: '角色与权限', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('权限目录版本不一致');
  await expect(page.getByRole('button', { name: '创建角色', exact: true })).toBeDisabled();
  for (const edit of await page.getByRole('button', { name: '编辑', exact: true }).all()) await expect(edit).toBeDisabled();
});
