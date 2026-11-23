/** 持久化平台真实浏览器验收入口；使用脚本提供的临时库，端口独占，不复用未知服务。 */
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './verification/platform', workers: 1, fullyParallel: false, outputDir: 'test-results/platform',
  use: { baseURL: 'http://127.0.0.1:15173', browserName: 'chromium', contextOptions: { reducedMotion: 'reduce' } },
  webServer: [
    { command: 'node scripts/serve-backend.mjs', url: 'http://127.0.0.1:18080/actuator/health', reuseExistingServer: false },
    { command: 'pnpm --filter @c2k/web dev', url: 'http://127.0.0.1:15173', reuseExistingServer: false },
  ], reporter: 'list',
});
