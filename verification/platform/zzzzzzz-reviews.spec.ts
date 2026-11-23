/** 真实审核浏览器验收；隔离合成成员/来源/ZIP，验证自审与指派及三种尺寸，不调用模型。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { parsePlatform, permissionPrerequisites } from '@c2k/contracts';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test.use({ actionTimeout: 10000 });
/** @param page 已登录页面 @param title 注册页面名称 @returns 通过工作台入口和原生Tabs切换，不绕过导航权限 */
async function navigate(page: Page, title: string): Promise<void> {
  const group = ['逆向任务', '预检任务'].includes(title) ? '逆向工作台' : '知识工作台';
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: group, exact: true }).click();
  await page.getByRole('tab', { name: title, exact: true }).click();
}
/** @param page 独立浏览器页面 @param username 合成成员登录名 @returns 登录成功进入目录，不输出凭证 */
async function login(page: Page, username = 'admin'): Promise<void> {
  await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill(username); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page); await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
}
/** @param page 已登录页面 @param path 固定同源地址 @param value 合成输入 @param method 写方法默认POST @param expected 预期状态默认201 @returns 非204返回JSON，204返回null */
async function write(page: Page, path: string, value: object, method = 'POST', expected = 201): Promise<unknown> {
  const csrf = parsePlatform('Csrf', await (await page.request.get('/api/v1/auth/csrf')).json()); const response = await page.request.fetch(path, { method, headers: { [csrf.headerName]: csrf.token }, data: value }); expect(response.status()).toBe(expected); return expected === 204 ? null : response.json();
}
/** @param page 当前视图 @param name 非敏感截图名 @returns 没有页面横向溢出并保留实际截图 */
async function capture(page: Page, name: string): Promise<void> { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/platform/${name}.png`, fullPage: true, animations: 'disabled' }); }
for (const width of [380, 900, 1440]) {
  test(`${width}px审核空状态与默认折叠菜单`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await login(page); await expect(page.getByRole('link', { name: '候选审核', exact: true })).not.toBeVisible(); await navigate(page, '候选审核'); await expect(page.getByText('暂无可读审核')).toBeVisible(); await expect(page.locator('.ant-pagination')).toHaveCount(0); await capture(page, `reviews-empty-${width}`);
  });
}
test('候选纯文本阅读、自审确认、指定人驳回及撤权隐藏真实闭环', async ({ page, browser }) => {
  test.setTimeout(100000); await login(page); const root = mkdtempSync(join(tmpdir(), 'c2k-review-ui-')); const reviewerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' }); const reader = await reviewerContext.newPage(); const ownerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' }); const ownerPage = await ownerContext.newPage();
  try {
    const owner = parsePlatform('Member', await write(page, '/api/v1/members', { username: 'review-owner', displayName: '合成候选作者', password: 'Test-Only-Password-2026' }));
    const reviewer = parsePlatform('Member', await write(page, '/api/v1/members', { username: 'review-reader', displayName: '合成业务审核人', password: 'Test-Only-Password-2026' }));
    const role = parsePlatform('Role', await write(page, '/api/v1/roles', { name: '合成审核角色', permissions: permissionPrerequisites(['device.pair', 'source.analyze', 'candidate.read', 'candidate.download', 'candidate.import', 'review.submit', 'review.decide']) }));
    for (const member of [owner, reviewer]) await write(page, `/api/v1/members/${member.id}/roles`, { roleIds: [role.id], revision: 0 }, 'PUT', 204);
    const system = parsePlatform('CatalogSystem', await write(page, '/api/v1/systems', { name: '审核合成系统' })); const source = parsePlatform('Source', await write(page, '/api/v1/sources', { name: '审核合成仓库', kind: 'REPOSITORY', locator: 'https://example.invalid/review.git', branch: 'main', enabled: true, systemIds: [system.id] }));
    for (const member of [owner, reviewer]) await write(page, `/api/v1/sources/${source.id}/grants/true`, { memberId: member.id, revision: 0 }, 'PUT', 204);
    await login(ownerPage, 'review-owner'); await login(reader, 'review-reader'); const pairing = parsePlatform('Pairing', await write(ownerPage, '/api/v1/devices/pairings', {}));
    const paired = await ownerPage.request.post('/runtime/v1/pair', { data: { code: pairing.code, name: '审核合成设备', os: 'test', arch: 'test', version: '1' } }); expect(paired.status()).toBe(201); const device = parsePlatform('DeviceCredential', await paired.json());
    const archive = join(root, 'knowledge.zip'); execFileSync('/usr/bin/zip', ['-q', '-r', archive, 'ontology', 'domains', 'graph', 'mappings', 'rules'], { cwd: resolve('verification/fixtures/skill-2.0'), stdio: 'ignore' });
    const imported = await ownerPage.request.post('/runtime/v1/candidates', { headers: { Authorization: `Bearer ${device.token}` }, multipart: { requestId: crypto.randomUUID(), bindings: JSON.stringify([{ sourceId: source.id, revision: 0, repository: 'fixture-core', commit: 'a'.repeat(40) }]), archive: { name: 'knowledge.zip', mimeType: 'application/zip', buffer: readFileSync(archive) } } }); expect(imported.status()).toBe(201); const candidate = parsePlatform('Candidate', await imported.json());
    await navigate(ownerPage, '候选知识'); await ownerPage.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click();
    const report = parsePlatform('CandidateReport', await (await ownerPage.request.get(`/api/v1/candidates/${candidate.id}`)).json()); const asset = report.assets[0]!;
    await ownerPage.getByRole('button', { name: asset.path, exact: true }).click(); await expect(ownerPage.getByLabel('文件纯文本')).toBeVisible(); await expect(ownerPage.getByLabel('文件纯文本')).not.toBeEmpty(); await capture(ownerPage, 'candidate-text-1440'); await ownerPage.keyboard.press('Escape');
    await ownerPage.getByRole('button', { name: '提交审核', exact: true }).click(); await ownerPage.getByRole('radio', { name: '自己审核', exact: true }).check(); await ownerPage.getByRole('dialog', { name: '提交候选审核', exact: true }).getByRole('button', { name: '提交审核', exact: true }).click();
    await expect(ownerPage.getByRole('dialog', { name: '候选审核详情', exact: true })).toBeVisible(); await expect(ownerPage.getByRole('button', { name: '确认审核', exact: true })).toBeVisible();
    for (const width of [380, 900, 1440]) { await ownerPage.setViewportSize({ width, height: width === 380 ? 620 : 900 }); await capture(ownerPage, `review-pending-${width}`); }
    await ownerPage.getByRole('button', { name: '确认审核', exact: true }).click(); await expect(ownerPage.getByRole('dialog', { name: '确认本候选版本', exact: true }).getByRole('button', { name: '确认审核', exact: true })).toBeDisabled(); await ownerPage.getByLabel('审核意见', { exact: true }).fill('已核对合成退款流程和映射，候选级确认，不改原包。'); await ownerPage.getByRole('dialog', { name: '确认本候选版本', exact: true }).getByRole('button', { name: '确认审核', exact: true }).click(); await expect(ownerPage.getByText('审核确认', { exact: true })).toHaveCount(2); await expect(ownerPage.getByRole('dialog', { name: '确认本候选版本', exact: true })).not.toBeVisible(); await expect(ownerPage.getByRole('button', { name: '返回列表', exact: true })).toBeFocused(); await capture(ownerPage, 'review-confirmed-1440'); await ownerPage.keyboard.press('Escape'); await expect(ownerPage.getByRole('dialog', { name: '候选审核详情', exact: true })).not.toBeVisible();
    await navigate(ownerPage, '候选知识'); await ownerPage.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click(); await ownerPage.getByRole('button', { name: '提交审核', exact: true }).click(); await ownerPage.getByRole('radio', { name: '指定审核人', exact: true }).check(); await ownerPage.getByRole('combobox', { name: '审核人', exact: true }).click(); await ownerPage.getByText('合成业务审核人', { exact: true }).click(); await ownerPage.getByRole('dialog', { name: '提交候选审核', exact: true }).getByRole('button', { name: '提交审核', exact: true }).click(); await expect(ownerPage.getByRole('dialog', { name: '候选审核详情', exact: true })).toBeVisible(); await expect(ownerPage.getByRole('button', { name: '确认审核', exact: true })).toHaveCount(0);
    await navigate(reader, '候选审核'); await reader.getByRole('button', { name: candidate.digest.slice(0, 16), exact: true }).click(); await reader.getByRole('button', { name: asset.path, exact: true }).click(); await expect(reader.getByLabel('文件纯文本')).toBeVisible(); await reader.keyboard.press('Escape');
    // 两个待审对象之间用历史返回切换，A意见必须消失，不能沿用到B或其他候选。
    const reviewA = parsePlatform('ReviewPage', await (await reader.request.get('/api/v1/reviews')).json()).items[0]!;
    const secondImport = await ownerPage.request.post('/runtime/v1/candidates', { headers: { Authorization: `Bearer ${device.token}` }, multipart: { requestId: crypto.randomUUID(), bindings: JSON.stringify([{ sourceId: source.id, revision: 0, repository: 'fixture-core', commit: 'a'.repeat(40) }]), archive: { name: 'knowledge.zip', mimeType: 'application/zip', buffer: readFileSync(archive) } } }); expect(secondImport.status()).toBe(201); const secondCandidate = parsePlatform('Candidate', await secondImport.json());
    const reviewB = parsePlatform('Review', await write(ownerPage, '/api/v1/reviews', { candidateId: secondCandidate.id, reviewerId: reviewer.id, requestId: crypto.randomUUID() }));
    await reader.getByRole('button', { name: '返回列表', exact: true }).click(); await reader.getByRole('button', { name: '刷新', exact: true }).click();
    await reader.locator(`tr[data-row-key="${reviewB.id}"]`).getByRole('button').click(); await expect(reader.getByRole('dialog', { name: '候选审核详情', exact: true })).toBeVisible(); await reader.getByRole('button', { name: '返回列表', exact: true }).click();
    await reader.locator(`tr[data-row-key="${reviewA.id}"]`).getByRole('button').click(); await reader.getByRole('button', { name: '确认审核', exact: true }).click(); await reader.getByLabel('审核意见', { exact: true }).fill('仅属于A的未提交意见');
    await reader.goBack(); await expect(reader.getByRole('dialog', { name: '确认本候选版本', exact: true })).not.toBeVisible(); await reader.goBack(); await expect(reader.getByRole('dialog', { name: '候选审核详情', exact: true })).toBeVisible(); await expect(reader.getByText('仅属于A的未提交意见', { exact: true })).toHaveCount(0); expect(parsePlatform('Review', await (await reader.request.get(`/api/v1/reviews/${reviewB.id}`)).json()).state).toBe('PENDING');
    await reader.goForward(); await reader.goForward(); await expect(reader.getByRole('button', { name: '驳回', exact: true })).toBeVisible();
    await reader.getByRole('button', { name: '驳回', exact: true }).click(); await reader.getByLabel('审核意见', { exact: true }).fill('缺少合成异常路径证据，请补充。'); await reader.getByRole('button', { name: '确认驳回', exact: true }).click(); await expect(reader.getByText('已驳回', { exact: true })).toHaveCount(2); await expect(reader.getByRole('dialog', { name: '驳回本候选版本', exact: true })).not.toBeVisible(); await capture(reader, 'review-rejected-1440'); await reader.keyboard.press('Escape'); await expect(reader.getByRole('dialog', { name: '候选审核详情', exact: true })).not.toBeVisible();
    await reader.route('**/api/v1/reviews?page=*', (route) => route.abort()); await reader.getByRole('button', { name: '刷新', exact: true }).click(); await expect(reader.getByRole('alert')).toBeVisible(); await expect(reader.locator('tr[data-row-key]')).toHaveCount(0); await capture(reader, 'reviews-network-error-1440'); await reader.unroute('**/api/v1/reviews?page=*'); await reader.getByRole('button', { name: '重新加载', exact: true }).click(); await expect(reader.locator('tr[data-row-key]')).toHaveCount(2);
    expect((await reader.request.get(`/api/v1/candidates/${candidate.id}/archive`)).status()).toBe(404);
    await write(page, `/api/v1/sources/${source.id}/grants/false`, { memberId: reviewer.id, revision: 0 }, 'PUT', 204); await reader.getByRole('button', { name: '刷新', exact: true }).click(); await expect(reader.getByText('暂无可读审核')).toBeVisible(); await expect(reader.locator('.ant-pagination')).toHaveCount(0);
  } catch (error) { await ownerPage.screenshot({ path: 'test-results/platform/review-owner-failure.png' }).catch(() => undefined); await reader.screenshot({ path: 'test-results/platform/review-reader-failure.png' }).catch(() => undefined); throw error; } finally { await reviewerContext.close().catch(() => undefined); await ownerContext.close().catch(() => undefined); rmSync(root, { recursive: true, force: true }); }
});
