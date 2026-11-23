/** TS/JS 中文说明静态门禁入口；检查手写声明的职责和显式函数文档，不证明注释语义与实现必然一致。 */
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 遍历源码与工程脚本，排除依赖、构建和第三方生成物。
 * @param {string} directory 仓库内目录路径，不可为空。
 * @returns {string[]} 手写 TS/JS 文件路径列表，不返回 null。
 */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'target', '.git', 'test-results', 'playwright-report'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:tsx?|mts|mjs)$/.test(path) ? [path] : [];
  });
}

/**
 * 检查声明前 JSDoc 中文说明及函数参数/返回说明，复杂回调语义仍需独立审查。
 * @param {import('typescript').SourceFile} file 已解析的源文件，不可为空。
 * @returns {string[]} 违规位置和原因，空数组表示未发现静态违规。
 */
export function check(file) {
  const failures = [];
  /**
   * 遍历显式声明；匿名简单回调不机械要求文档。
   * @param {import('typescript').Node} node 当前语法节点，不可为空。
   * @returns {void} 结果写入当前文件的违规列表。
   */
  function visit(node) {
    const functionNode = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isMethodSignature(node) ? node
      : (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) ? node.initializer : undefined;
    const owner = ts.isVariableDeclaration(node) ? node.parent.parent : node;
    const declaration = functionNode || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isPropertySignature(node);
    if (declaration) {
      const comments = ts.getLeadingCommentRanges(file.text, owner.getFullStart()) ?? [];
      const doc = comments.map((range) => file.text.slice(range.pos, range.end)).findLast((text) => text.startsWith('/**')) ?? '';
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (!/[\u4e00-\u9fff]/.test(doc)) failures.push(`${file.fileName}:${line} 缺少中文文档说明`);
      if (functionNode) {
        const tags = ts.getJSDocTags(owner);
        for (const parameter of functionNode.parameters) {
          const name = parameter.name.getText(file);
          if (!tags.some((tag) => ts.isJSDocParameterTag(tag) && tag.name.getText(file) === name)) failures.push(`${file.fileName}:${line} 缺少参数文档 ${name}`);
        }
        if (!ts.isConstructorDeclaration(functionNode) && !ts.isSetAccessorDeclaration(functionNode) && !doc.includes('@returns')) failures.push(`${file.fileName}:${line} 缺少返回约定`);
      }
    }
    ts.forEachChild(node, visit);
  }
  const firstDoc = /^\s*(?:#![^\n]*\n)?\s*(\/\*\*[\s\S]*?\*\/)/.exec(file.text)?.[1] ?? '';
  if (!/[\u4e00-\u9fff]/.test(firstDoc)) failures.push(`${file.fileName}:1 缺少模块中文职责`);
  visit(file);
  return failures;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = sourceFiles('.').flatMap((path) => check(ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)));
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('手写 TS/JS 声明中文说明静态检查通过；语义一致性另行 review。');
}
