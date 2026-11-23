/** 真实 Java 服务与 Web 开发代理联通验收入口；独占端口并由测试管理进程，不复用未知服务。 */
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './verification/integration',
  use: { baseURL: 'http://127.0.0.1:15173', browserName: 'chromium', contextOptions: { reducedMotion: 'reduce' } },
  webServer: [
    { command: 'java -jar backend/target/platform-backend-0.1.0-SNAPSHOT.jar', url: 'http://127.0.0.1:18080/actuator/health', reuseExistingServer: false },
    { command: 'pnpm --filter @c2k/web dev', url: 'http://127.0.0.1:15173', reuseExistingServer: false },
  ],
  reporter: 'list',
});
