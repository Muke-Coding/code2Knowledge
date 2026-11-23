/** 本地验证子进程生命周期；以直接CLI进程接收信号，等待清理完成后才允许调用方回收临时数据库。 */
import { spawn } from 'node:child_process';
/**
 * 执行单个命令并转发包装脚本信号，取消时返回非零；不得在args中传密码。
 * @param {string} command 可执行文件路径，不为空。
 * @param {string[]} args 非敏感参数数组，不为空。
 * @param {NodeJS.ProcessEnv} env 子进程环境，不为空；不得打印。
 * @returns {Promise<number>} 子进程退出码，取消为130，无null。
 * @throws {Error} 命令无法启动时抛出，调用方仍须finally清理。
 */
export async function run(command, args, env) {
  const child = spawn(command, args, { stdio: 'inherit', env });
  let interrupted = false;
  /** @returns 向直接CLI转发终止信号，让其先回收自建服务，无业务返回。 */
  function stop() { interrupted = true; child.kill('SIGTERM'); }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
    return interrupted ? 130 : typeof code === 'number' ? code : 1;
  } finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
}
