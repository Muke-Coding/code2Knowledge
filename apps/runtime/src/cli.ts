#!/usr/bin/env node
/** 运行时CLI入口；支持私有配对与前台心跳，支持显式来源许可和隔离预检；支持显式本机模型配置后的多来源Claude逆向；不支持远端拉取、自动升级或后台服务安装。 */
import { bindDocuments, unbindDocuments } from './document-bindings.js';
import { configureAgent } from './agent-profile.js';
import { importCandidate } from './candidate-import.js';
import { bindSource, unbindSource } from './source-bindings.js';
import { diagnose } from './doctor.js';
import { pair, serverOrigin, ConnectionFailure } from './connection.js';
import { runtimeHome, requireUnpaired, saveDevice } from './store.js';
import { start, status, stop } from './daemon.js';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

/**
 * 从标准输入读取配对码，TTY不回显；禁止把码放命令参数/环境变量，避免历史记录和进程列表泄露。
 * @returns 去首尾空格的单次码，不为空。
 * @throws {Error} 输入为空、超过256字节或取消时拒绝。
 */
async function pairingCode(): Promise<string> {
  if (process.stdin.isTTY) {
    console.log('粘贴平台生成的配对码，然后回车（不回显）：');
    const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
    const reader = createInterface({ input: process.stdin, output: silent, terminal: true });
    try { return await new Promise((done, reject) => { reader.once('line', (line) => line.length <= 256 ? done(line.trim()) : reject(new Error('配对码超长'))); reader.once('SIGINT', () => reject(new Error('已取消'))); }); }
    finally { reader.close(); silent.end(); }
  }
  let result = '';
  for await (const chunk of process.stdin) { result += String(chunk); if (result.length > 256) throw new Error('配对码超长'); }
  return result.trim();
}
/**
 * 解析已确认命令；凭证只在私有文件内保存，不输出任何未知异常内容。
 * @param args 去除Node路径后的参数，不为空，空数组显示帮助。
 * @returns 本次操作完成；失败用退出码1或2表达，无业务返回。
 */
export async function main(args: string[]): Promise<void> {
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('用法：\n  c2k-runtime doctor [--server ORIGIN]\n  c2k-runtime connect --server ORIGIN --name NAME\n  c2k-runtime start [--once]\n  c2k-runtime status\n  c2k-runtime stop\n  c2k-runtime bind-source --id SOURCE_UUID --revision NUMBER --repo LOCAL_PATH\n  c2k-runtime unbind-source --id SOURCE_UUID\n资料：c2k-runtime bind-documents --id SOURCE_UUID --revision NUMBER --root LOCAL_PATH\n  c2k-runtime unbind-documents --id SOURCE_UUID\n模型：c2k-runtime configure-agent --file PRIVATE_JSON\n导入：c2k-runtime import-candidate --archive ZIP --bindings JSON [--request UUID]\n配对码仅从标准输入读取。start前台运行；Ctrl+C或另一终端stop停止。仅使用显式绑定来源；配置专用模型后可领取多来源逆向，不联网拉取代码。'); return;
  }
  try {
    if (args[0] === 'doctor' && (args.length === 1 || (args.length === 3 && args[1] === '--server'))) {
      const result = await diagnose(args[2]); console.log(JSON.stringify(result)); if (!result.nodeSupported || result.platform === 'unavailable') process.exitCode = 1; return;
    }
    const home = runtimeHome();
    if (args[0] === 'bind-documents' && args.length === 7 && args[1] === '--id' && args[3] === '--revision' && args[5] === '--root' && args[2] && args[4] && args[6]) { bindDocuments(home, args[2], Number(args[4]), args[6]); console.log('本机资料根许可已保存；仅对确认的配置版本生效'); return; }
    if (args[0] === 'unbind-documents' && args.length === 3 && args[1] === '--id' && args[2]) { unbindDocuments(home, args[2]); console.log('本机资料许可已撤销；未删除原始资料'); return; }
    if (args[0] === 'configure-agent' && args.length === 3 && args[1] === '--file' && args[2]) { configureAgent(home, args[2]); console.log('已保存运行时专用模型配置；未调用模型，未上传平台，不继承个人Claude账号'); return; }
    if (args[0] === 'connect' && args.length === 5 && args[1] === '--server' && args[3] === '--name' && args[2] && args[4]) {
      const server = serverOrigin(args[2]); requireUnpaired(home);
      const credential = await pair(server, await pairingCode(), args[4]);
      saveDevice(home, { server, ...credential }); console.log('设备已配对；执行start发送心跳'); return;
    }
    if (args[0] === 'import-candidate' && (args.length === 5 || args.length === 7) && args[1] === '--archive' && args[3] === '--bindings' && args[2] && args[4] && (args.length === 5 || args[5] === '--request')) { await importCandidate(home, args[2], args[4], args[6]); return; }
    if (args[0] === 'bind-source' && args.length === 7 && args[1] === '--id' && args[3] === '--revision' && args[5] === '--repo' && args[2] && args[4] && args[6]) { bindSource(home, args[2], Number(args[4]), args[6]); console.log('本机来源许可已保存；仅对确认的配置版本生效'); return; }
    if (args[0] === 'unbind-source' && args.length === 3 && args[1] === '--id' && args[2]) { unbindSource(home, args[2]); console.log('本机来源许可已撤销；未删除仓库'); return; }
    if (args[0] === 'start' && (args.length === 1 || (args.length === 2 && args[1] === '--once'))) { await start(home, args[1] === '--once'); return; }
    if (args[0] === 'status' && args.length === 1) { console.log(JSON.stringify(status(home))); return; }
    if (args[0] === 'stop' && args.length === 1) { console.log(stop(home) ? '已请求停止本机心跳进程' : '本机没有活动心跳进程'); return; }
    console.error('命令或参数不受支持，使用--help查看用法'); process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof ConnectionFailure ? error.message : args[0] === 'configure-agent' ? '模型配置未保存；请检查专用配置字段、绝对路径、内网TLS端点及文件0600权限。' : args[0] === 'import-candidate' ? '候选导入未完成；请检查包格式、本机来源许可及当前分析授权；若已输出请求ID，重试时沿用该ID。' : (args[0] === 'bind-source' || args[0] === 'bind-documents') ? '来源许可未保存；请检查来源UUID、配置版本、配对身份以及本机普通Git仓库目录与权限。' : '操作未完成；请检查配对码、平台地址及设备目录权限。已配对目录不可覆盖；需要重新配对时选择新目录并撤销旧设备。'); process.exitCode = 1;
  }
}
await main(process.argv.slice(2));
