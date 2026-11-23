/** 权限源契约门禁与生成入口；统一菜单、动作、依赖、Java常量和升级脚本，禁止手改生成结果。 */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const raw = readFileSync(new URL('packages/contracts/src/permissions.json', root), 'utf8');
const catalog = JSON.parse(raw);
const codes = new Set(catalog.permissions.map((item) => item.code));
assert.equal(codes.size, catalog.permissions.length, '动作码不得重复');
for (const menu of catalog.menus) assert(codes.has(menu.permission), '菜单须引用已注册动作');
for (const [code, deps] of Object.entries(catalog.dependencies)) { assert(codes.has(code)); for (const dep of deps) assert(codes.has(dep)); }
for (const code of catalog.baseline) assert(codes.has(code));
/**
 * 将受版本控制的源契约转义为SQL字面量，仅处理仓库内静态说明，不接受用户输入。
 * @param {string} value 协议码或中文说明，不为空。
 * @returns {string} PostgreSQL字符串字面量。
 */
function literal(value) { return `'${value.replaceAll("'", "''")}'`; }
let constants = 'package com.code2knowledge.authorization.constant;\n\n/** 自动生成的细分动作常量；源permissions.json，菜单不代替资源授权，禁止直接修改。 */\npublic final class PermissionCodes {\n';
for (const item of catalog.permissions) constants += `    /** ${item.name}：${item.description} */\n    public static final String ${item.code.toUpperCase().replaceAll('.', '_')} = "${item.code}";\n`;
constants += '    /** 禁止实例化协议常量容器。 */\n    private PermissionCodes() { }\n}\n';
const historical = JSON.parse(readFileSync(new URL('verification/permissions-v11.snapshot.json', root), 'utf8'));
let sql = '-- 自动生成：源permissions.json，使用node verification/permissions-contract.mjs --write维护；未发布迁移方可重生成。\n';
for (const item of historical.permissions) sql += `INSERT INTO c2k_permission(code,name,description) VALUES (${literal(item.code)},${literal(item.name)},${literal(item.description)}) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;\n`;
sql += '\n-- 仅升级展开历史动作，生产授权接口不保留manage别名。\n';
for (const [old, replacements] of Object.entries(historical.legacy)) for (const code of replacements) sql += `INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, ${literal(code)} FROM c2k_role_permission WHERE permission_code=${literal(old)} ON CONFLICT DO NOTHING;\n`;
for (const old of Object.keys(historical.legacy).filter((code) => !new Set(historical.permissions.map((item) => item.code)).has(code))) sql += `DELETE FROM c2k_role_permission WHERE permission_code=${literal(old)};\nDELETE FROM c2k_permission WHERE code=${literal(old)};\n`;
sql += `\n-- 旧成员基础能力改为可撤销的企业角色；新成员无隐式动作，原资源标识和范围不变。\nCREATE TEMP TABLE c2k_baseline_migration AS SELECT id AS tenant_id, gen_random_uuid()::varchar(36) AS role_id FROM c2k_tenant;\nINSERT INTO c2k_role(id,tenant_id,name,description)\nSELECT role_id, tenant_id, '历史基础访问-' || role_id, '升级保留原基础访问；可显式撤销，不含来源分析或审核权。' FROM c2k_baseline_migration;\n`;
for (const code of historical.baseline) sql += `INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, ${literal(code)} FROM c2k_baseline_migration;\n`;
sql += `INSERT INTO c2k_member_role(tenant_id,member_id,role_id)\nSELECT a.tenant_id,a.id,b.role_id FROM c2k_account a JOIN c2k_baseline_migration b ON b.tenant_id=a.tenant_id WHERE a.role='MEMBER';\nDELETE FROM c2k_role_permission WHERE role_id='MEMBER';\nUPDATE c2k_role SET description='已启用成员基础身份；业务动作必须由显式角色授予，资源范围另行授权。' WHERE id='MEMBER';\nDROP TABLE c2k_baseline_migration;\n`;
for (const code of historical.baseline) sql += `INSERT INTO c2k_role_permission VALUES ('ADMIN',${literal(code)}) ON CONFLICT DO NOTHING;\n`;
// 递归闭包一次补齐历史角色的读取依赖；UNION去重，即使误写循环也会终止，不新增任何资源范围。
sql += '\n-- 历史角色补齐已确认前置；不授予资源范围。\nWITH RECURSIVE dependency(code,required) AS (VALUES\n';
sql += Object.entries(historical.dependencies).flatMap(([code, deps]) => deps.map((dep) => `    (${literal(code)}::varchar,${literal(dep)}::varchar)`)).join(',\n');
sql += `\n), expanded(role_id,permission_code) AS (\n    SELECT role_id,permission_code::varchar FROM c2k_role_permission\n    UNION\n    SELECT e.role_id,d.required FROM expanded e JOIN dependency d ON d.code=e.permission_code\n)\nINSERT INTO c2k_role_permission(role_id,permission_code)\nSELECT role_id,permission_code FROM expanded ON CONFLICT DO NOTHING;\n`;
for (const [path, output] of [['backend/src/main/resources/permission-catalog.json', raw], ['backend/src/main/java/com/code2knowledge/authorization/constant/PermissionCodes.java', constants], ['backend/src/main/resources/db/migration/V11__granular_permissions.sql', sql]]) {
  const target = new URL(path, root);
  if (process.argv.includes('--write')) writeFileSync(target, output);
  else assert.equal(readFileSync(target, 'utf8'), output, `${path}与权限源契约不一致`);
}

// V11固定使用历史快照；本轮新增动作仅生成尚未发布的V13尾部，不重写已应用迁移。
const additions = catalog.permissions.filter((item) => !historical.permissions.some((old) => old.code === item.code));
const migration = new URL('backend/src/main/resources/db/migration/V13__departments_and_navigation.sql', root);
const marker = '-- 权限增量由permissions.json生成；历史V11保持不变。\n';
const text = readFileSync(migration, 'utf8');
const boundary = text.indexOf(marker);
assert(boundary >= 0, 'V13缺少权限生成边界');
const generated = additions.map((item) => `INSERT INTO c2k_permission(code,name,description) VALUES(${literal(item.code)},${literal(item.name)},${literal(item.description)});\nINSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN',${literal(item.code)});\n`).join('');
const expected = text.slice(0, boundary) + marker + generated;
if (process.argv.includes('--write')) writeFileSync(migration, expected);
else assert.equal(text, expected, 'V13权限增量与源契约不一致');
