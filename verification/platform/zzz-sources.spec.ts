/** 真实来源管理浏览器验收；仅合成定位，不访问外部Git/文件，覆盖登记、版本、逐项授权和企业导航。 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { parsePlatform, permissionPrerequisites } from '@c2k/contracts';
/** @param page 已登录页面 @param title 注册页面名称 @returns 通过工作台入口和原生Tabs切换，不绕过导航权限 */
async function navigate(page: Page, title: string): Promise<void> {
  const group = ['逆向任务', '预检任务'].includes(title) ? '逆向工作台' : '知识工作台';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: group, exact: true }).click();
  await page.getByRole('tab', { name: title, exact: true }).click();
}
/** 本文件管理员只通过一次真实登录获取会话，在隔离页面复用；不伪造身份，不放宽生产登录限速，不落盘凭证。 */
let adminCookies: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;
/** @param page 已登录页面 @returns 通过真实父菜单点击展开可用入口；不修改组件状态或权限。 */
async function expandNavigation(page: Page): Promise<void> {
  const parents = page.getByRole('navigation', { name: '主导航' }).locator('.ant-menu-submenu-title[aria-expanded="false"]');
  while (await parents.count()) await parents.first().click();
}
/** @param page 隔离页面 @param username 合成账户名，默认admin @returns 登录后进入目录 */
async function login(page: Page, username = 'admin'): Promise<void> {
  if (username === 'admin' && adminCookies) { await page.context().addCookies(adminCookies); await page.goto('/systems'); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(page); return; }
  await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(page);
  if (username === 'admin') adminCookies = await page.context().cookies();
}
/** @param page 已登录页面 @param path 同源API @param method 写入方法 @param data 合成输入 @param status 预期状态 @returns 合法响应JSON，204返回null */
async function write(page: Page, path: string, method: string, data: object, status: number): Promise<unknown> {
  const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
  const response = await page.request.fetch(path, { method, headers: { [csrf.headerName]: csrf.token }, data }); expect(response.status()).toBe(status); return status === 204 ? null : response.json();
}
/** @param page 当前页面 @param name 合成截图名称 @returns 保存截图并确认页面没有横向溢出 */
async function capture(page: Page, name: string): Promise<void> { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, animations: 'disabled', fullPage: true }); }
for (const width of [380, 900, 1440]) {
  test(`${width}px分组导航与来源表单键盘和未保存保护`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await login(page);
    const navigation = page.getByRole('navigation', { name: '主导航' });
    for (const name of ['知识工作台', '逆向工作台', '设备管理', '系统设置']) await expect(navigation.getByText(name, { exact: true })).toBeVisible();
    await expect(navigation.getByRole('menu').first()).toHaveClass(/ant-menu/);
    await expect(page.getByText('本地企业', { exact: true })).toHaveCount(0);
    const parent = navigation.locator('.ant-menu-submenu-title').filter({ hasText: '系统设置' });
    await parent.click(); await expect(navigation.getByRole('link', { name: '成员', exact: true })).not.toBeVisible();
    await capture(page, `menu-collapsed-${width}`);
    const tab = page.getByRole('tab', { name: /来源管理$/ });
    await tab.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '来源管理', exact: true })).toBeVisible();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('navigation', { name: '当前位置' })).toContainText('来源管理');
    await page.goto('/sources/'); await expect(page.getByRole('heading', { name: '来源管理', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: '成员', exact: true })).not.toBeVisible();
    await capture(page, `menu-default-collapsed-${width}`); await expect(page.locator('.ant-pagination')).toHaveCount(0);
    const create = page.getByRole('button', { name: '登记来源', exact: true }); await create.focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('来源名称', { exact: true })).toBeEnabled(); await expect(page.getByLabel('默认分支', { exact: true })).toHaveValue('master');
    await page.getByLabel('默认分支', { exact: true }).fill('main'); await page.getByLabel('来源名称', { exact: true }).fill('合成资料登记');
    await capture(page, `source-form-${width}`); await page.getByRole('button', { name: '保存来源', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '保存来源', exact: true })).toBeInViewport(); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '放弃未保存的来源修改？', exact: true })).toBeVisible(); await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(page.getByLabel('来源名称', { exact: true })).toHaveValue('合成资料登记');
    await page.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '放弃修改', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(create).toBeFocused();
  });
}
test('登记仓库与运行时资料、独立范围授权和配置版本失效', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await login(page);
  const system = parsePlatform('CatalogSystem', await write(page, '/api/v1/systems', 'POST', { name: '来源登记合成系统' }, 201));
  await navigate(page, '来源管理');
  await page.getByRole('button', { name: '登记来源', exact: true }).click();
  await page.getByLabel('来源名称', { exact: true }).fill('合成仓库'); await page.getByLabel('仓库地址', { exact: true }).fill('https://example.invalid/enterprise/' + 'long-path-'.repeat(30) + '/repository.git');
  await page.getByLabel('默认分支', { exact: true }).fill('main'); await page.getByRole('combobox', { name: '关联系统', exact: true }).click(); await page.getByText(system.name, { exact: true }).last().click();
  await page.getByLabel('来源名称', { exact: true }).click(); await page.getByRole('button', { name: '保存来源', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '合成仓库' }); await expect(row).toBeVisible(); await expect(row.getByRole('button', { name: '检查资格', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: '分析授权', exact: true }).click();
  const admin = parsePlatform('Session', await (await page.request.get('/api/v1/auth/session')).json());
  await page.getByRole('combobox', { name: '选择来源授权成员', exact: true }).click(); await page.getByText(`${admin.displayName} (${admin.username})`, { exact: true }).last().click(); await page.getByRole('button', { name: '授权', exact: true }).click();
  await expect(page.getByText('当前配置范围有效', { exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: '选择来源授权成员', exact: true })).toBeEnabled(); await page.getByRole('combobox', { name: '选择来源授权成员', exact: true }).focus(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await row.getByRole('button', { name: '检查资格', exact: true }).click(); await expect(page.getByText('当前分析资格有效；本次未启动逆向任务', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '编辑', exact: true }).click(); await expect(page.getByLabel('默认分支', { exact: true })).toHaveValue('main'); await page.getByLabel('默认分支', { exact: true }).fill('release/2026'); await page.getByRole('button', { name: '保存来源', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(row.getByRole('button', { name: '检查资格', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: '分析授权', exact: true }).click(); await expect(page.getByText('配置已变更或来源停用，需重新授权', { exact: true })).toBeVisible(); await page.getByRole('button', { name: '撤销', exact: true }).click(); await page.getByRole('button', { name: '撤销', exact: true }).last().click(); await expect(page.getByText('尚未授权成员', { exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: '选择来源授权成员', exact: true })).toBeEnabled(); await page.getByRole('combobox', { name: '选择来源授权成员', exact: true }).focus(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '登记来源', exact: true }).click(); await page.getByLabel('来源名称', { exact: true }).fill('合成资料'); await page.getByRole('radio', { name: '运行时资料', exact: true }).click();
  await page.getByLabel('资料相对路径', { exact: true }).fill('业务资料/采购 ERD.md'); await expect(page.getByLabel('默认分支', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: '关联系统', exact: true }).click(); await page.getByText(system.name, { exact: true }).last().click(); await page.getByLabel('来源名称', { exact: true }).click(); await page.getByRole('button', { name: '保存来源', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible(); await expect(page.getByRole('row').filter({ hasText: '合成资料' })).toBeVisible();
  for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `source-content-${width}`); }
  const ordinary = parsePlatform('Member', await write(page, '/api/v1/members', 'POST', { username: 'source-viewer', displayName: '合成来源访问者', password: 'Test-Only-Password-2026' }, 201));
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' }); const member = await context.newPage();
  try {
    await login(member, ordinary.username); await expect(member.getByRole('link', { name: '来源管理', exact: true })).toHaveCount(0); await expect(member.getByRole('navigation', { name: '主导航' }).getByText('系统设置', { exact: true })).toHaveCount(0);
    const role = parsePlatform('Role', await write(page, '/api/v1/roles', 'POST', { name: '来源分析验收角色', permissions: permissionPrerequisites(['source.analyze']) }, 201));
    await write(page, `/api/v1/members/${ordinary.id}/roles`, 'PUT', { roleIds: [role.id], revision: 0 }, 204);
    await member.reload(); await expect(member.getByRole('navigation', { name: '主导航' })).toBeVisible(); await expandNavigation(member); await navigate(member, '来源管理'); await expect(member.getByText('暂无可分析的来源', { exact: true })).toBeVisible();
    const sources = parsePlatform('SourcePage', await (await page.request.get('/api/v1/sources')).json()); const repository = sources.items.find((item) => item.name === '合成仓库')!;
    await write(page, `/api/v1/sources/${repository.id}/grants/true`, 'PUT', { memberId: ordinary.id, revision: repository.revision }, 204); await member.getByRole('button', { name: '刷新来源', exact: true }).click();
    await expect(member.getByRole('row').filter({ hasText: '合成仓库' })).toBeVisible(); await expect(member.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
    await member.getByRole('button', { name: '检查资格', exact: true }).click(); await expect(member.getByText('当前分析资格有效；本次未启动逆向任务', { exact: true })).toBeVisible();
    await write(page, `/api/v1/sources/${repository.id}/grants/false`, 'PUT', { memberId: ordinary.id, revision: repository.revision }, 204); await member.getByRole('button', { name: '刷新来源', exact: true }).click(); await expect(member.getByText('暂无可分析的来源', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
test('网络失败移除旧行、重试恢复；版本冲突不覆盖用户输入', async ({ page }) => {
  await login(page); await navigate(page, '来源管理'); await expect(page.getByText('合成仓库', { exact: true })).toBeVisible();
  await page.route('**/api/v1/sources?*', (route) => route.abort()); await page.getByRole('button', { name: '刷新来源', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('无法连接平台'); await expect(page.getByText('合成仓库', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/v1/sources?*'); await page.getByRole('button', { name: '重试', exact: true }).click(); await expect(page.getByText('合成仓库', { exact: true })).toBeVisible();
  await page.getByRole('row').filter({ hasText: '合成仓库' }).getByRole('button', { name: '编辑', exact: true }).click(); await expect(page.getByLabel('默认分支', { exact: true })).toHaveValue('release/2026');
  const sources = parsePlatform('SourcePage', await (await page.request.get('/api/v1/sources')).json()); const source = sources.items.find((item) => item.name === '合成仓库')!;
  const rawBindings: unknown = await (await page.request.get(`/api/v1/sources/${source.id}/bindings`)).json();
  if (!Array.isArray(rawBindings)) throw new Error('绑定响应必须为数组');
  const bindings = rawBindings.map((value) => parsePlatform('CatalogSystem', value));
  await write(page, `/api/v1/sources/${source.id}`, 'PUT', { name: source.name, kind: source.kind, locator: source.locator, enabled: source.enabled, revision: source.revision, systemIds: bindings.map((item) => item.id), branch: 'release/other' }, 200);
  await page.getByLabel('默认分支', { exact: true }).fill('release/my-draft'); await page.getByRole('button', { name: '保存来源', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '来源配置已变化' })).toBeVisible(); await expect(page.getByLabel('默认分支', { exact: true })).toHaveValue('release/my-draft');
});

test('列表总数收缩后回到有效第一页，空页不锁死分页', async ({ page }) => {
  await login(page);
  const existing = parsePlatform('SourcePage', await (await page.request.get('/api/v1/sources')).json()).items[0]!;
  let shrink = false;
  // 此处只模拟分页时序，不模拟鉴权；SQL可见数量与21项分页由SourceIT真实PostgreSQL验收。
  await page.route('**/api/v1/sources?*', async (route) => {
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    await route.fulfill({ json: { page: number, total: shrink ? 1 : 21, items: shrink ? (number === 1 ? [existing] : []) : Array.from({ length: number === 1 ? 20 : 1 }, (_, index) => ({ ...existing, id: `${existing.id}-${number}-${index}`, name: `合成分页${number}-${index}` })) } });
  });
  await navigate(page, '来源管理'); await expect(page.getByText('21 个来源', { exact: true })).toBeVisible();
  await page.locator('.ant-pagination-item-2').click(); await expect(page.getByText('合成分页2-0', { exact: true })).toBeVisible();
  shrink = true; await page.getByRole('button', { name: '刷新来源', exact: true }).click(); await expect(page.getByText('1 个来源', { exact: true })).toBeVisible(); await expect(page.getByText(existing.name, { exact: true })).toBeVisible();
});
test('编辑读取期间配置变化时拒绝混合版本，重新加载取得新配置', async ({ page }) => {
  await login(page);
  const system = parsePlatform('CatalogSystem', await write(page, '/api/v1/systems', 'POST', { name: '合成读取并发系统' }, 201));
  const source = parsePlatform('Source', await write(page, '/api/v1/sources', 'POST', { name: '合成读取并发来源', kind: 'REPOSITORY', locator: 'https://example.invalid/concurrent/repo.git', branch: 'main', enabled: true, systemIds: [system.id] }, 201));
  let changed = false;
  // 在来源版本与绑定读取之间真实提交新配置，验证单调版本前后核对；禁止客户端把旧绑定搭配新版本保存。
  await page.route(`**/api/v1/sources/${source.id}/bindings`, async (route) => {
    if (!changed) { changed = true; await write(page, `/api/v1/sources/${source.id}`, 'PUT', { name: source.name, kind: source.kind, locator: source.locator, branch: 'release/concurrent', enabled: true, systemIds: [system.id], revision: source.revision }, 200); }
    await route.continue();
  });
  await navigate(page, '来源管理'); await page.getByRole('row').filter({ hasText: source.name }).getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '来源读取期间已变化' })).toBeVisible(); await expect(page.getByRole('button', { name: '保存来源', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重新加载', exact: true }).click(); await expect(page.getByLabel('默认分支', { exact: true })).toHaveValue('release/concurrent');
});

/** 成员Table使用完整授权列表的本地分页；真实写入11名合成成员，验证跨页、返回和数据不丢失。 */
test('成员表格真实数据分页，每页10条且下一页可返回', async ({ page }) => {
  await login(page);
  for (let index = 0; index < 11; index++) await write(page, '/api/v1/members', 'POST', { username: `paging-member-${index}`, displayName: `分页成员${index}`, password: 'Test-Only-Password-2026' }, 201);
  await page.getByRole('link', { name: '成员', exact: true }).click();
  await expect(page.getByRole('heading', { name: '成员', exact: true })).toBeVisible();
  await expect(page.locator('.ant-table-tbody > tr[data-row-key]')).toHaveCount(10);
  const first = await page.locator('.ant-table-tbody > tr[data-row-key]').first().getAttribute('data-row-key');
  await page.locator('.ant-pagination-next').click();
  await expect(page.locator('.ant-pagination-item-2')).toHaveClass(/ant-pagination-item-active/);
  await expect(page.locator(`tr[data-row-key="${first}"]`)).toHaveCount(0);
  await capture(page, 'members-pagination-second');
  await page.locator('.ant-pagination-prev').click();
  await expect(page.locator(`tr[data-row-key="${first}"]`)).toBeVisible();
});
