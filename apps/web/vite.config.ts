/** Web 开发构建入口；开发代理仅代理本地平台API，不承担生产认证或反向代理部署。 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 15173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:18080', '/runtime': 'http://127.0.0.1:18080', '/actuator/health': 'http://127.0.0.1:18080' } } });
