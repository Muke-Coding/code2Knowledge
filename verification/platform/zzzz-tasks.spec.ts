/** 真实Java/Web/CLI本机来源预检验收；临时仓库和凭证隔离，不联网、不运行业务代码、不输出配对码或Bearer。 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parsePlatform, type Task, type Source } from '@c2k/contracts';
/** @param page 已登录页面 @param title 注册页面名称 @returns 通过工作台入口和原生Tabs切换，不绕过导航权限 */
async function navigate(page: Page, title: string): Promise<void> {
  const group = ['逆向任务', '预检任务'].includes(title) ? '逆向工作台' : '知识工作台';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: group, exact: true }).click();
  await page.getByRole('tab', { name: title, exact: true }).click();
}
/** 本文件一次真实登录后复用同一会话Cookie，不修改生产限速，不把身份注入服务端。 */
let cookies: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;
/** @param page 已登录页面 @returns 通过真实父菜单点击展开可用入口；不修改组件状态或权限。 */
async function expandNavigation(page: Page): Promise<void> {
  const parents = page.getByRole('navigation', { name: '主导航' }).locator('.ant-menu-submenu-title[aria-expanded="false"]');
  while (await parents.count()) await parents.first().click();
}
/** @param page 隔离页面 @returns 登录后进入本人预检任务 */
async function login(page: Page): Promise<void> {
  if (cookies) { await page.context().addCookies(cookies); await page.goto('/tasks'); }
  else { await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page); await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); await expandNavigation(page); cookies = await page.context().cookies(); await navigate(page, '预检任务'); }
  await expect(page.getByRole('heading', { name: '预检任务', exact: true })).toBeVisible();
}
/** @param page 已登录页面 @param path 固定同源API @param data 合成JSON @param expected 预期HTTP状态 @returns JSON，无正文null */
async function post(page: Page, path: string, data: object, expected = 201): Promise<unknown> {
  const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json()); const response = await page.request.post(path, { headers: { [csrf.headerName]: csrf.token }, data }); expect(response.status()).toBe(expected); return expected === 204 ? null : response.json();
}
/** @param page 已登录页面 @param prefix 合成来源名 @returns 已向自己逐项授权的本地main仓库来源 */
async function source(page: Page, prefix: string): Promise<Source> {
  const system = parsePlatform('CatalogSystem', await post(page, '/api/v1/systems', { name: prefix + '-系统' }));
  const source = parsePlatform('Source', await post(page, '/api/v1/sources', { name: prefix, kind: 'REPOSITORY', locator: `https://example.invalid/fixture/${crypto.randomUUID()}.git`, branch: 'main', enabled: true, systemIds: [system.id] }));
  const actor = parsePlatform('Session', await (await page.request.get('/api/v1/auth/session')).json()); const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
  expect((await page.request.put(`/api/v1/sources/${source.id}/grants/true`, { headers: { [csrf.headerName]: csrf.token }, data: { memberId: actor.id, revision: source.revision } })).status()).toBe(204); return source;
}
/** @param page 当前页面 @param name 合成截图名 @returns 无页面横向溢出并保存截图，不含凭证 */
async function capture(page: Page, name: string): Promise<void> { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, fullPage: true, animations: 'disabled' }); }
/** @param args 不含凭证的CLI参数 @param home 本次私有设备根 @param input 一次性配对stdin，默认空 @returns 仅退出码，不输出原始日志 */
async function cli(args: string[], home: string, input = ''): Promise<number> {
  const child = spawn(process.execPath, ['apps/runtime/dist/cli.js', ...args], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: ['pipe', 'ignore', 'ignore'] }); child.stdin.end(input); const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
  try { return await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', (value) => done(value ?? 1)); }); } finally { clearTimeout(timeout); }
}
/** @param page 已登录页面 @param id 私有任务UUID @returns 校验的当前状态，不含租约 */
async function task(page: Page, id: string): Promise<Task> { return parsePlatform('Task', await (await page.request.get(`/api/v1/tasks/${id}`)).json()); }
for (const width of [380, 900, 1440]) {
  test(`${width}px预检创建、必填校验、键盘焦点与未保存保护`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await login(page); await capture(page, `tasks-${width}`);
    const create = page.getByRole('button', { name: '创建预检', exact: true }); await create.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '创建预检', exact: true })).toBeVisible(); await page.getByLabel('任务名称', { exact: true }).fill('合成来源预检');
    await page.getByRole('button', { name: '创建任务', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '创建任务', exact: true })).toBeInViewport(); await expect(page.getByRole('button', { name: '创建任务', exact: true })).toBeDisabled(); await capture(page, `task-form-${width}`);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: '放弃未提交的预检任务？', exact: true })).toBeVisible(); await page.getByRole('button', { name: '继续填写', exact: true }).click(); await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('合成来源预检');
    await page.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '放弃输入', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(create).toBeFocused();
  });
}
test('真实CLI显式绑定与隔离预检、缺许可失败、手动重试、来源清单回传且工作区不变', async ({ page }) => {
  test.setTimeout(90000); await login(page); const root = mkdtempSync(join(tmpdir(), 'c2k-task-e2e-')); const home = join(root, 'device'), repo = join(root, 'repo'); let daemon: ReturnType<typeof spawn> | undefined;
  const logs: string[] = []; let stopped: Promise<number> | undefined;
  try {
    mkdirSync(repo); execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' }); writeFileSync(join(repo, 'README.md'), '合成来源预检\n'); execFileSync('git', ['-C', repo, 'add', '.']); execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', '合成提交'], { stdio: 'ignore' });
    const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); writeFileSync(join(repo, 'README.md'), '开发中的修改'); const before = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
    const origin = await source(page, '预检实测仓库'); const pairing = parsePlatform('Pairing', await post(page, '/api/v1/devices/pairings', {}));
    expect(await cli(['connect', '--server', 'http://127.0.0.1:15173', '--name', '预检实测设备'], home, pairing.code)).toBe(0);
    const raw: unknown = JSON.parse(readFileSync(join(home, 'device.json'), 'utf8')); const credential = raw as Record<string, string>; const deviceId = credential.id!;
    const first = parsePlatform('Task', await post(page, '/api/v1/tasks', { name: '缺许可后重试', sourceId: origin.id, sourceRevision: origin.revision, deviceId, requestId: crypto.randomUUID() }));
    daemon = spawn(process.execPath, [resolve('apps/runtime/dist/cli.js'), 'start'], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] }); daemon.stdout?.on('data', (value) => logs.push(String(value))); daemon.stderr?.on('data', (value) => logs.push(String(value))); stopped = new Promise((done) => daemon?.once('exit', (value) => done(value ?? 1)));
    await expect.poll(async () => (await task(page, first.id)).state, { timeout: 20000 }).toBe('FAILED');
    expect((await task(page, first.id)).message).toContain('未显式绑定'); expect(await cli(['bind-source', '--id', origin.id, '--revision', String(origin.revision), '--repo', repo], home)).toBe(0);
    await page.getByRole('button', { name: '刷新任务', exact: true }).click(); const row = page.getByRole('row').filter({ hasText: first.name }); await expect(row.getByRole('button', { name: '重试', exact: true })).toBeVisible(); await row.getByRole('button', { name: '重试', exact: true }).click();
    await expect.poll(async () => (await task(page, first.id)).state, { timeout: 25000 }).toBe('SUCCEEDED'); const result = await task(page, first.id); expect(result.attemptNumber).toBe(2); expect(result.commitId).toBe(commit); expect(result.fileCount).toBe(1); expect(result.archiveBytes).toBeGreaterThan(0); expect(JSON.stringify(result).includes(repo)).toBe(false); expect(result).not.toHaveProperty('leaseId');
    expect(execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' })).toBe(before); expect(readFileSync(join(repo, 'README.md'), 'utf8')).toBe('开发中的修改');
    await page.getByRole('button', { name: '刷新任务', exact: true }).click(); await row.getByRole('button', { name: first.name, exact: true }).click(); await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible(); await expect(page.getByText(commit, { exact: true })).toBeVisible(); await expect(page.getByText(/第\s*1\s*次/, { exact: false })).toBeVisible();
    for (const width of [380, 900, 1440]) { await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `task-result-${width}`); }
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: '创建预检', exact: true }).click(); await page.getByLabel('任务名称', { exact: true }).fill('界面创建预检');
    await page.getByRole('combobox', { name: '代码来源', exact: true }).click(); await expect(page.getByRole('option', { name: `${origin.name} · main`, exact: true })).toHaveCount(1); await page.getByRole('combobox', { name: '代码来源', exact: true }).press('ArrowDown'); await page.getByRole('combobox', { name: '代码来源', exact: true }).press('Enter');
    await page.getByRole('combobox', { name: '执行设备', exact: true }).click(); await page.getByText('预检实测设备 · 在线', { exact: true }).last().click();
    await page.getByRole('button', { name: '创建任务', exact: true }).click(); await expect(page.getByRole('dialog', { name: '创建预检', exact: true })).not.toBeVisible(); await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible();
    await expect(page.getByText('来源清单已接收；未执行逆向或发布', { exact: true }).first()).toBeVisible({ timeout: 25000 });
    expect(await cli(['stop'], home)).toBe(0); expect(await stopped).toBe(0); stopped = undefined; expect(logs.join('').includes(credential.token!)).toBe(false); expect(logs.join('').includes(pairing.code)).toBe(false); expect(logs.join('').includes(repo)).toBe(false);
  } finally { if (stopped) { daemon?.kill('SIGTERM'); await stopped; } rmSync(root, { recursive: true, force: true }); }
});
test('排队任务取消、手动重试保留历史，网络失败清除旧列表并允许恢复', async ({ page }) => {
  await login(page); const origin = await source(page, '取消预检仓库'); const pairing = parsePlatform('Pairing', await post(page, '/api/v1/devices/pairings', {}));
  const pairedResponse = await page.request.post('/runtime/v1/pair', { data: { code: pairing.code, name: '离线预检设备', os: 'test', arch: 'test', version: '1' } }); expect(pairedResponse.status()).toBe(201); const credential = parsePlatform('DeviceCredential', await pairedResponse.json());
  const created = parsePlatform('Task', await post(page, '/api/v1/tasks', { name: '离线排队任务', sourceId: origin.id, sourceRevision: origin.revision, deviceId: credential.id, requestId: crypto.randomUUID() }));
  await page.getByRole('button', { name: '刷新任务', exact: true }).click(); const row = page.getByRole('row').filter({ hasText: created.name }); await row.getByRole('button', { name: '取消', exact: true }).click(); await expect(page.getByText('平台立即拒绝旧结果；离线设备可能尚未停止。', { exact: true })).toBeVisible(); await page.getByRole('button', { name: '取消任务', exact: true }).click(); await expect(row.getByText('已取消', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: '重试', exact: true }).click(); await expect(row.getByText('第 2 次尝试', { exact: true })).toBeVisible(); await row.getByRole('button', { name: created.name, exact: true }).click(); await expect(page.getByText('已取消', { exact: true })).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.route('**/api/v1/tasks?*', (route) => route.abort()); await page.getByRole('button', { name: '刷新任务', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('无法连接平台'); await expect(page.getByRole('row').filter({ hasText: created.name })).toHaveCount(0);
  await page.unroute('**/api/v1/tasks?*'); await page.getByRole('button', { name: '重新加载', exact: true }).click(); await expect(page.getByRole('row').filter({ hasText: created.name })).toBeVisible();
});
