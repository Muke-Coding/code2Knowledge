/** 私有候选真实浏览器验收；使用合成Skill包、本机隔离设备和临时数据库，不调用模型或外部系统。 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parsePlatform } from '@c2k/contracts';
/** @param page 已登录页面 @param title 注册页面名称 @returns 通过工作台入口和原生Tabs切换，不绕过导航权限 */
async function navigate(page: Page, title: string): Promise<void> {
  const group = ['逆向任务', '预检任务'].includes(title) ? '逆向工作台' : '知识工作台';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: group, exact: true }).click();
  await page.getByRole('tab', { name: title, exact: true }).click();
}
/** 本文件真实登录后复用本人的有效Cookie，不注入服务器身份。 */
let cookies: Awaited<ReturnType<BrowserContext['cookies']>> | null = null;
/** @param page 隔离页面 @returns 真实身份进入候选页，菜单仍默认折叠 */
async function login(page: Page): Promise<void> {
  if (cookies) { await page.context().addCookies(cookies); await page.goto('/systems'); await navigate(page, '候选知识'); }
  else { await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page); await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); cookies = await page.context().cookies(); await navigate(page, '候选知识'); }
  await expect(page.getByRole('heading', { name: '候选知识', exact: false })).toBeVisible();
}
/** @param page 当前页面 @param name 合成截图名 @returns 无页面横向溢出，截图保留组件交互证据 */
async function capture(page: Page, name: string): Promise<void> { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, fullPage: true, animations: 'disabled' }); }
/** @param page 已登录页面 @param path 同源固定路径 @param data 合成请求 @returns 经状态确认的JSON，不输出身份秘密 */
async function post(page: Page, path: string, data: object): Promise<unknown> {
  const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json()); const response = await page.request.post(path, { headers: { [csrf.headerName]: csrf.token }, data }); expect(response.status()).toBe(201); return response.json();
}
/** @param args 不含凭证的CLI参数 @param home 临时设备目录 @param input stdin配对码，默认空 @returns 退出码；不收集或输出凭证 */
async function cli(args: string[], home: string, input = ''): Promise<number> {
  const child = spawn(process.execPath, ['apps/runtime/dist/cli.js', ...args], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: ['pipe', 'ignore', 'ignore'] }); child.stdin.end(input); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
  try { return await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', (code) => done(code ?? 1)); }); } finally { clearTimeout(timer); }
}
for (const width of [380, 900, 1440]) {
  test(`${width}px候选空列表、导入指引和焦点恢复`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await login(page); await expect(page.getByText('暂无可读候选知识')).toBeVisible(); await expect(page.locator('.ant-pagination')).toHaveCount(0); await capture(page, `candidates-empty-${width}`);
    const guide = page.getByRole('button', { name: '导入指引', exact: true }); await guide.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog', { name: '从设备导入产物' })).toBeVisible(); await expect(page.getByText('支持代码与资料来源包', { exact: false })).toBeVisible(); await expect(page.getByRole('button', { name: '知道了', exact: true })).toBeFocused(); await capture(page, `candidate-guide-${width}`); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(guide).toBeFocused();
  });
}
test('真实CLI导入后列表分页、资产详情和原包下载，撤权后不再展示旧内容', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1440, height: 900 }); await login(page); const root = mkdtempSync(join(tmpdir(), 'c2k-candidate-ui-')); const home = join(root, 'device');
  try {
    const system = parsePlatform('CatalogSystem', await post(page, '/api/v1/systems', { name: '候选导入合成系统', description: '' }));
    const source = parsePlatform('Source', await post(page, '/api/v1/sources', { name: '候选导入合成仓库', kind: 'REPOSITORY', locator: 'https://example.invalid/fixture-core.git', branch: 'main', enabled: true, systemIds: [system.id] }));
    const actor = parsePlatform('Session', await (await page.request.get('/api/v1/auth/session')).json()); const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json());
    expect((await page.request.put(`/api/v1/sources/${source.id}/grants/true`, { headers: { [csrf.headerName]: csrf.token }, data: { memberId: actor.id, revision: source.revision } })).status()).toBe(204);
    const pairing = parsePlatform('Pairing', await post(page, '/api/v1/devices/pairings', {})); expect(await cli(['connect', '--server', 'http://127.0.0.1:15173', '--name', '候选导入合成设备'], home, pairing.code)).toBe(0);
    const repo = join(root, 'repo'); mkdirSync(repo); execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' }); writeFileSync(join(repo, 'README.md'), '仅用于本机来源许可；包内来源声明不等于真实代码核验。');
    expect(await cli(['bind-source', '--id', source.id, '--revision', String(source.revision), '--repo', repo], home)).toBe(0);
    const archive = join(root, 'knowledge.zip'); execFileSync('/usr/bin/zip', ['-q', '-r', archive, 'ontology', 'domains', 'graph', 'mappings', 'rules'], { cwd: resolve('verification/fixtures/skill-2.0'), stdio: 'ignore' });
    const mappings = join(root, 'bindings.json'); writeFileSync(mappings, JSON.stringify([{ sourceId: source.id, revision: source.revision, repository: 'fixture-core', commit: 'a'.repeat(40) }]));
    const imported = await cli(['import-candidate', '--archive', archive, '--bindings', mappings], home);
    if (imported !== 0) { const device = JSON.parse(readFileSync(join(home, 'device.json'), 'utf8')) as Record<string, string>; const diagnostic = await page.request.post('/runtime/v1/candidates', { headers: { Authorization: `Bearer ${device.token}` }, multipart: { requestId: crypto.randomUUID(), bindings: readFileSync(mappings, 'utf8'), archive: { name: 'knowledge.zip', mimeType: 'application/zip', buffer: readFileSync(archive) } } }); let code = 'UNKNOWN'; try { code = parsePlatform('ApiError', await diagnostic.json()).code; } catch { /* 只报告安全错误码，不输出正文或凭证。 */ } throw new Error(`CLI导入失败，独立设备请求HTTP ${diagnostic.status()}，错误码${code}`); }
    await page.getByRole('button', { name: '刷新候选', exact: true }).click(); await expect(page.getByText('1 个候选版本')).toBeVisible(); await expect(page.locator('.ant-pagination')).toBeVisible(); const result = parsePlatform('CandidatePage', await (await page.request.get('/api/v1/candidates?page=1')).json()); const candidate = result.items[0]!;
    for (const width of [380, 900, 1440]) {
      await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(page, `candidates-list-${width}`); await page.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click(); await expect(page.getByRole('dialog', { name: '候选版本', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '资产清单' })).toBeVisible(); await expect(page.getByText('原包业务待核验', { exact: true })).toBeVisible(); await capture(page, `candidate-detail-${width}`); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    // 慢响应仍在途时用浏览器后退离开React页面；释放响应后旧页面不得触发原身份附件下载。
    let releaseDownload: (() => void) | undefined; let downloadStarted: (() => void) | undefined;
    const pendingDownload = new Promise<void>((done) => { releaseDownload = done; }); const startedDownload = new Promise<void>((done) => { downloadStarted = done; }); let staleDownloads = 0;
    page.on('download', () => { staleDownloads++; });
    await page.route('**/api/v1/candidates/*/archive', async (route) => { downloadStarted?.(); await pendingDownload; await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: readFileSync(archive) }).catch(() => undefined); });
    await page.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click(); await expect(page.getByRole('button', { name: '下载原包', exact: true })).toBeEnabled(); await page.getByRole('button', { name: '下载原包', exact: true }).click(); await startedDownload; await page.goBack(); await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); releaseDownload?.(); await page.unroute('**/api/v1/candidates/*/archive');
    await navigate(page, '候选知识'); await expect(page.getByText('1 个候选版本')).toBeVisible(); expect(staleDownloads).toBe(0);
    // 同一来源的21个独立候选验证真实服务端跨页；仅同设备Bearer在内存传递，不打印或保留凭证。
    const device = JSON.parse(readFileSync(join(home, 'device.json'), 'utf8')) as Record<string, string>;
    for (let index = 0; index < 20; index++) { const response = await page.request.post('/runtime/v1/candidates', { headers: { Authorization: `Bearer ${device.token}` }, multipart: { requestId: crypto.randomUUID(), bindings: readFileSync(mappings, 'utf8'), archive: { name: 'knowledge.zip', mimeType: 'application/zip', buffer: readFileSync(archive) } } }); expect(response.status()).toBe(201); parsePlatform('Candidate', await response.json()); }
    await page.getByRole('button', { name: '刷新候选', exact: true }).click(); await expect(page.getByText('21 个候选版本')).toBeVisible(); await expect(page.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true })).toHaveCount(20); await page.locator('.ant-pagination-next').click(); await expect(page.locator('.ant-pagination-item-active')).toHaveText('2'); await expect(page.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true })).toHaveCount(1); await capture(page, 'candidates-page-two-1440');
    await page.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click(); await expect(page.getByRole('button', { name: '下载原包', exact: true })).toBeEnabled(); const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载原包', exact: true }).click(); expect((await download).suggestedFilename()).toBe(`candidate-${candidate.id}.zip`);
    expect((await page.request.put(`/api/v1/sources/${source.id}/grants/false`, { headers: { [csrf.headerName]: csrf.token }, data: { memberId: actor.id, revision: source.revision } })).status()).toBe(204);
    await page.getByRole('button', { name: '下载原包', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('候选不存在或已失去来源授权'); await expect(page.getByRole('heading', { name: '资产清单' })).toHaveCount(0); await expect(page.getByRole('button', { name: '重试', exact: true })).toBeFocused(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await page.getByRole('button', { name: '刷新候选', exact: true }).click(); await expect(page.getByText('暂无可读候选知识')).toBeVisible(); await expect(page.locator('.ant-pagination')).toHaveCount(0); expect(parsePlatform('CandidatePage', await (await page.request.get('/api/v1/candidates?page=1')).json()).total).toBe(0); await capture(page, 'candidate-revoked-1440');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
