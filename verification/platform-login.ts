/** 真实浏览器登录提交辅助；仅在服务端429时遵守Retry-After，不跳过认证、不注入会话或放宽生产限流。 */
import { test, expect, type Page } from '@playwright/test';
/**
 * @param page 已填写合成测试账号密码的登录页面，不读取或输出字段值。
 * @returns 真实登录成功；最多按一次服务端等待时间重试，其他错误立即失败。
 * @throws {Error} 非成功响应、非法Retry-After或重复限流时失败，不能假装已经登录。
 */
export async function submitLogin(page: Page): Promise<void> {
  test.setTimeout(Math.max(test.info().timeout, 90000));
  const password = await page.getByLabel('密码', { exact: true }).inputValue();
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse((value) => new URL(value.url()).pathname === '/api/v1/auth/login' && value.request().method() === 'POST'),
      page.getByRole('button', { name: '登录', exact: true }).click(),
    ]);
    if (response.status() !== 429) { expect(response.ok()).toBe(true); return; }
    if (attempt === 1) throw new Error('服务端等待后仍拒绝登录，保留真实失败');
    const seconds = Number(response.headers()['retry-after']);
    expect(Number.isInteger(seconds) && seconds > 0 && seconds <= 60).toBe(true);
    await expect(page.getByRole('alert')).toContainText('请求过于频繁');
    // 该等待由真实服务端要求；只影响合成测试节奏，不改变应用的限流窗口。
    await page.waitForTimeout(seconds * 1000);
    // 登录失败会清空密码；仅在内存中复用调用方已填写的合成凭证，不读取个人配置或输出凭证。
    await page.getByLabel('密码', { exact: true }).fill(password);
  }
}
