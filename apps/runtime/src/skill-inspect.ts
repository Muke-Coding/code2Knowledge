/** 服务端固定校验器子进程入口；只接收显式暂存ZIP，输出有界元数据，不读设备凭证、模型或通知配置。 */
import { readSkillBundle } from './skill-adapter.js';
import { skillReport } from './skill-report.js';
try {
  if (process.argv.length !== 3 || !process.argv[2]) throw new Error('input');
  const bundle = await readSkillBundle(process.argv[2]);
  process.stdout.write(JSON.stringify(await skillReport(bundle.files, bundle.digest)));
} catch { process.stderr.write('知识包校验失败'); process.exitCode = 1; }
