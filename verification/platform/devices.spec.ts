/** 私有设备真实Web/Java/CLI闭环；合成Git目录与临时设备凭证隔离，不读取客户代码，不输出配对或Bearer。 */
import { test, expect, type Page } from '@playwright/test';
import { submitLogin } from '../platform-login.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parsePlatform } from '@c2k/contracts';

/** CLI测试结果，不在断言中回显未经清洗的输出。 */
interface CliResult {
  /** 子进程退出码，取消或失败非零。 */
  code: number;
  /** 捕获文本，仅检查秘密是否泄露，不直接打印。 */
  output: string;
}

/** @param page 已登录页面 @returns 通过真实父菜单点击展开可用入口；不修改组件状态或权限。 */
async function expandNavigation(page: Page): Promise<void> {
  const parents = page.getByRole('navigation', { name: '主导航' }).locator('.ant-menu-submenu-title[aria-expanded="false"]');
  while (await parents.count()) await parents.first().click();
}
/**
 * 本轮真实表单登录，取得会话，不注入Cookie。
 * @param page 隔离浏览器页面，不为空。
 * @returns 登录完成，无业务返回。
 */
async function login(page: Page): Promise<void> {
  await page.goto('/'); await page.getByLabel('登录名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('Test-Only-Password-2026'); await submitLogin(page);
  await expect(page.getByRole('heading', { name: '系统目录', exact: true })).toBeVisible(); await expandNavigation(page);
  await page.getByRole('link', { name: '设备管理', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的设备', exact: true })).toBeVisible();
}
/**
 * 执行真实Node CLI，秘密仅stdin传入，捕获输出只用于验证未泄漏；失败不把输出交给断言打印。
 * @param args CLI参数，不得含凭证，不为空。
 * @param home 独立设备私有目录，不为空。
 * @param input 标准输入，允许空字符串，配对码不得记录。
 * @returns 退出码和安全输出，不为空。
 */
async function cli(args: string[], home: string, input = ''): Promise<CliResult> {
  const child = spawn(process.execPath, ['apps/runtime/dist/cli.js', ...args], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', (value) => { output += String(value); }); child.stderr.on('data', (value) => { output += String(value); }); child.stdin.end(input);
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try { const code = await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', (value) => done(value ?? 1)); }); return { code, output }; }
  finally { clearTimeout(timeout); }
}
for (const width of [380, 900, 1440]) {
  test(`${width}px设备空列表与配对抽屉`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 380 ? 620 : 900 });
    await login(page);
    await expect(page.getByText('尚未接入设备', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/platform/devices-empty-${width}.png`, animations: 'disabled', fullPage: true });
    await page.getByRole('button', { name: '接入设备', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: '接入私有设备' })).toBeVisible();
    await expect(page.getByLabel('配对码', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '复制配对码', exact: true }).click(); await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
    // 配对原码禁止进入截图及持久化测试附件，截图时遮盖原码区域。
    await page.screenshot({ path: `test-results/platform/pairing-${width}.png`, animations: 'disabled', mask: [page.getByLabel('配对码', { exact: true })] });
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: '接入设备', exact: true })).toBeFocused();
  });
}
test('真实CLI在隔离合成仓库配对/心跳/停止/重连/撤销，设备不改仓库', async ({ page }) => {
  test.setTimeout(60000);
  const directory = mkdtempSync(join(tmpdir(), 'c2k-device-e2e-'));
  const home = join(directory, 'device'); const repository = join(directory, 'repo');
  mkdirSync(repository); execFileSync('git', ['init', '-q', repository]);
  const before = execFileSync('git', ['-C', repository, 'status', '--porcelain'], { encoding: 'utf8' });
  let daemon: ReturnType<typeof spawn> | undefined;
  try {
    await login(page); await page.getByRole('button', { name: '接入设备', exact: true }).click();
    await expect(page.getByLabel('配对码', { exact: true })).toBeVisible();
    const code = (await page.getByLabel('配对码', { exact: true }).textContent()) ?? '';
    const paired = await cli(['connect', '--server', 'http://127.0.0.1:15173', '--name', '本机隔离测试设备'], home, code);
    expect(paired.code).toBe(0); expect(paired.output.includes(code)).toBe(false);
    const raw = readFileSync(join(home, 'device.json'), 'utf8');
    const saved = JSON.parse(raw); const token = saved.token;
    expect(paired.output.includes(token)).toBe(false);
    expect((await cli(['connect', '--server', 'http://127.0.0.1:15173', '--name', '重复配对'], home, code)).code).toBe(1);
    await page.getByRole('button', { name: '完成，刷新设备', exact: true }).click();
    await expect(page.getByText('本机隔离测试设备', { exact: true })).toBeVisible();
    await expect(page.getByText('离线', { exact: true })).toBeVisible();
    // 模拟在创建锁目录后尚未写元数据便崩溃的残留；新实例必须安全恢复。
    mkdirSync(join(home, 'running'), { mode: 0o700 });
    const once = await cli(['start', '--once'], home); expect(once.code).toBe(0); expect(once.output.includes(token)).toBe(false);
    await page.getByRole('button', { name: '刷新设备', exact: true }).click(); await expect(page.getByText('在线', { exact: true })).toBeVisible();
    const response = await page.request.get('/api/v1/devices'); const devices = await response.json();
    expect(devices.length).toBe(1); expect(parsePlatform('Device', devices[0]).status).toBe('ONLINE');
    expect(JSON.stringify(devices).includes(token)).toBe(false);
    daemon = spawn(process.execPath, [resolve('apps/runtime/dist/cli.js'), 'start'], { cwd: repository, env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; daemon.stdout?.on('data', (value) => { log += String(value); }); daemon.stderr?.on('data', (value) => { log += String(value); });
    const exited = new Promise<number>((done) => daemon?.once('exit', (value) => done(value ?? 1)));
    await expect.poll(() => existsSync(join(home, 'running', 'process.json'))).toBe(true);
    expect((await cli(['start', '--once'], home)).code).toBe(1);
    expect(JSON.parse((await cli(['status'], home)).output).running).toBe(true);
    expect((await cli(['stop'], home)).code).toBe(0);
    expect(await exited).toBe(0); expect(log.includes(token)).toBe(false);
    expect(JSON.parse((await cli(['status'], home)).output).running).toBe(false);
    expect((await cli(['start', '--once'], home)).code).toBe(0);
    // SIGKILL残留锁元数据不应永久阻塞；两个同时恢复的实例仍只允许一个运行。
    const crashed = spawn(process.execPath, [resolve('apps/runtime/dist/cli.js'), 'start'], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: 'ignore' });
    const crashExit = new Promise((done) => crashed.once('exit', done));
    await expect.poll(() => existsSync(join(home, 'running', 'process.json'))).toBe(true);
    crashed.kill('SIGKILL'); await crashExit;
    const racers = [0, 1].map(() => spawn(process.execPath, [resolve('apps/runtime/dist/cli.js'), 'start'], { env: { PATH: process.env.PATH, C2K_RUNTIME_HOME: home }, stdio: 'ignore' }));
    const results = racers.map((child) => new Promise<number>((done) => child.once('exit', (value) => done(value ?? 1))));
    try {
      expect(await Promise.race(results)).toBe(1);
      await expect.poll(async () => JSON.parse((await cli(['status'], home)).output).running).toBe(true);
      expect((await cli(['stop'], home)).code).toBe(0);
      expect((await Promise.all(results)).sort()).toEqual([0, 1]);
    } finally { for (const child of racers) child.kill('SIGTERM'); }
    for (const width of [380, 900, 1440]) {
      await page.setViewportSize({ width, height: width === 380 ? 620 : 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/platform/device-online-${width}.png`, animations: 'disabled', fullPage: true });
    }
    await page.getByRole('button', { name: '撤销', exact: true }).click(); await page.getByRole('button', { name: '撤销', exact: true }).last().click();
    await expect(page.getByText('已失效', { exact: true })).toBeVisible();
    const refused = await cli(['start', '--once'], home); expect(refused.code).toBe(1); expect(refused.output.includes(token)).toBe(false);
    expect(execFileSync('git', ['-C', repository, 'status', '--porcelain'], { encoding: 'utf8' })).toBe(before);
  } finally { daemon?.kill('SIGTERM'); rmSync(directory, { recursive: true, force: true }); }
});
