/** 子进程信号回收回归；只使用合成进程，不接入数据库或读取本地凭证。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('包装进程收到SIGTERM后等待子进程退出并执行finally', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'c2k-process-'));
  const marker = join(directory, 'finally');
  const helper = pathToFileURL(resolve('scripts/process.mjs')).href;
  const childSource = 'process.on("SIGTERM",()=>process.exit(0)); console.log("ready"); setInterval(()=>{},1000);';
  const wrapperSource = `import { run } from ${JSON.stringify(helper)}; import { writeFileSync } from 'node:fs'; try { process.exitCode = await run(process.execPath, ['-e', ${JSON.stringify(childSource)}], process.env); } finally { writeFileSync(${JSON.stringify(marker)}, 'cleaned'); }`;
  const wrapper = spawn(process.execPath, ['--input-type=module', '-e', wrapperSource], { stdio: ['ignore', 'pipe', 'pipe'] });
  const timeout = setTimeout(() => wrapper.kill('SIGKILL'), 5000);
  try {
    await new Promise((done, reject) => { wrapper.stdout.once('data', done); wrapper.once('error', reject); });
    wrapper.kill('SIGTERM');
    const code = await new Promise((done) => wrapper.once('exit', done));
    assert.equal(code, 130);
    assert.equal(readFileSync(marker, 'utf8'), 'cleaned');
  } finally { clearTimeout(timeout); wrapper.kill('SIGKILL'); rmSync(directory, { recursive: true, force: true }); }
});
