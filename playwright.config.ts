/** Web 工程诊断验收入口；服务由测试启动，健康响应分别模拟状态，不冒充真实业务或后端联通验收。 */
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './verification/browser', use: { baseURL: 'http://127.0.0.1:15173', browserName: 'chromium', contextOptions: { reducedMotion: 'reduce' } }, webServer: { command: 'pnpm --filter @c2k/web dev', url: 'http://127.0.0.1:15173', reuseExistingServer: false }, reporter: 'list' });
