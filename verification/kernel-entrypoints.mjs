/** 双入口发行兼容验收；在临时目录离线安装真实npm包，验证无工作区私有路径依赖，不读取模型或通知配置。 */
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { syncSkillKernel } from '../scripts/sync-skill-kernel.mjs';
/** @param directory 要打包的源码目录 @param destination 本轮私有输出根 @returns 实际tarball绝对路径；不执行生命周期脚本 @throws {Error} 打包失败或输出非法 */
function pack(directory, destination) {
  const result = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (result.length !== 1 || !/^[a-zA-Z0-9._-]+\.tgz$/.test(result[0].filename)) throw new Error('打包响应非法');
  return join(destination, result[0].filename);
}
/** @returns 双入口包安装、模板兼容和生成漂移拒绝均通过；失败同样清理私有测试目录 @throws {Error} 包不完整、旧契约变化或离线依赖缺失 */
async function main() {
  const index = process.argv.indexOf('--skill-root');
  if (index < 0 || !process.argv[index + 1]) throw new Error('必须显式指定--skill-root');
  const skill = resolve(process.argv[index + 1]); await syncSkillKernel(skill, true);
  const temporary = await mkdtemp(join(tmpdir(), 'c2k-entrypoint-'));
  const platform = fileURLToPath(new URL('../', import.meta.url));
  try {
    const corePackage = pack(join(platform, 'packages/reverse-kernel'), temporary); const skillPackage = pack(skill, temporary);
    // 使用合成HOME和忽略生命周期，安装不能触发个人Skill注册、配置生成或飞书通知。
    const env = { ...process.env, HOME: join(temporary, 'home'), npm_config_cache: join(platform, '.local/kernel-npm-cache') };
    // 依赖通过本轮安装包与已安装yaml本地打包提供，验收不需要npm登录或公网。
    const yamlPackage = pack(join(platform, 'node_modules/.pnpm/yaml@2.9.0/node_modules/yaml'), temporary);
    execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--prefix', join(temporary, 'installation'), yamlPackage, corePackage, skillPackage], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const probe = `import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile}from'node:fs/promises';import{join}from'node:path';
import * as core from '@code2knowledge/reverse-kernel';
import{createRequire}from'node:module';const require=createRequire(import.meta.url);for(const name of['@code2knowledge/reverse-kernel','@code2knowledge/skill']){const consumer=createRequire(require.resolve(name+'/package.json'));assert.equal(JSON.parse(await readFile(consumer.resolve('yaml/package.json'),'utf8')).version,'2.9.0');}
import * as skill from './node_modules/@code2knowledge/skill/scripts/lib/contract.mjs';
const baseline=JSON.parse(await readFile(${JSON.stringify(join(platform, 'packages/reverse-kernel/test/legacy-1.0.2.json'))},'utf8'));
const root=await mkdtemp(${JSON.stringify(join(temporary, 'assets-'))});
try{assert.deepEqual(core.makeContext(baseline.input),skill.makeContext(baseline.input));await core.writeMaintenanceTemplates(root);await skill.writeBusinessTemplates(root,'退款',skill.makeContext(baseline.input));for(const[path,body]of Object.entries(baseline.templates))assert.equal(await readFile(join(root,path),'utf8'),body);assert.deepEqual(await core.validateContract(root),await skill.validateContract(root));assert.equal((await core.readAnalysisGuidelines()).length,3);assert.equal(core.schemaVersion,'2.0');await writeFile(join(root,'domains/overview.md'),'无元数据');assert.ok((await core.inspectContract(root)).diagnostics.some(x=>x.severity==='BLOCKING'));}finally{await rm(root,{recursive:true,force:true});}
console.log('独立安装双入口兼容通过');`;
    const installed = join(temporary, 'installation'); await writeFile(join(installed, 'probe.mjs'), probe);
    execFileSync(process.execPath, ['probe.mjs'], { cwd: installed, env, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync(process.execPath, ['node_modules/@code2knowledge/skill/scripts/check-kernel.mjs'], { cwd: installed, env, stdio: ['ignore', 'pipe', 'pipe'] });
    // 在安装副本破坏维护资料，必须由同一Skill发行门禁拒绝；不修改真实Skill源码。
    await writeFile(join(installed, 'node_modules/@code2knowledge/skill/references/analysis.md'), '测试漂移');
    assert.throws(() => execFileSync(process.execPath, ['node_modules/@code2knowledge/skill/scripts/check-kernel.mjs'], { cwd: installed, env, stdio: ['ignore', 'pipe', 'pipe'] }));
    console.log('PASS：内核包与Skill包离线独立安装、双入口模板及报告兼容、规范可读、非法资产及镜像漂移拒绝');
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
await main();
