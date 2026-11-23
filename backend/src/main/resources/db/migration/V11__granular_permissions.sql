-- 自动生成：源permissions.json，使用node verification/permissions-contract.mjs --write维护；未发布迁移方可重生成。
INSERT INTO c2k_permission(code,name,description) VALUES ('member.read','查看成员','读取本企业成员公开摘要，不含凭证；不允许创建、启停或分配角色。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('member.create','创建成员','创建本企业普通成员和初始口令；新成员无业务动作，不允许创建引导管理员。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('member.status','启停成员','启停本企业普通成员；停用立即失效旧会话和设备身份版本，不可操作引导管理员。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('role.read','查看角色','读取本企业自定义角色与只读内置角色及动作目录，不允许修改分配。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('role.create','创建角色','创建本企业自定义角色，可选择已注册权限；属于可委派权限的高权限操作。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('role.update','编辑角色','按版本编辑本企业自定义角色及动作，影响已分配成员；不能编辑内置角色。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('role.delete','删除角色','按版本删除未被成员引用的自定义角色；禁止删除内置角色。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('role.assign','分配角色','可委派角色权限，属于高权限；仍受同企业和受保护账号约束。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('catalog.read','查看授权目录','读取另行授权的系统目录元数据；目录可见不等于来源分析或知识读取。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('catalog.read.all','查看全部目录','允许查看本企业全部目录元数据，不授予源码或知识正文权限。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('catalog.create','登记系统','登记本企业系统名称和说明，不授予其他成员目录或内容权限。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('catalog.grant','授权系统目录','允许调整本企业此类资源授权，不获得分析或内容访问权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.read','查看授权来源','读取已逐项授权且当前版本有效的来源元数据，不读取源码或资料正文。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.read.all','查看全部来源','允许查看本企业全部目录元数据，不授予源码或知识正文权限。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.create','登记来源','登记本企业仓库或资料定位及系统绑定，不访问网络、本机文件或模型。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.update','编辑来源','按版本修改来源定位、分支和系统绑定；实际变更使旧版本分析授权失效。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.status','启停来源','仅启停本企业来源，不允许修改定位或系统绑定；实际变更使旧分析授权失效。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.grant','授权来源','允许调整本企业此类资源授权，不获得分析或内容访问权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('source.analyze','来源分析资格','对另行逐项授权的当前版本来源检查分析资格；不等于任务创建或候选读取。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('device.read','查看本人设备','只读取本人私有设备及连接状态，不包含专用设备凭证。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('device.pair','配对本人设备','创建单次短期配对码，兑换时重新核验权限，仅可登记本人设备。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('device.revoke','撤销本人设备','不可逆撤销本人私有设备，不能撤销或查看其他成员设备。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('task.read','查看本人预检','读取本人预检任务、状态和尝试记录，不取得其他成员任务或来源内容。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('task.create','创建预检','选择本人设备及当前逐项授权来源创建预检任务；运行时领取和回传重查授权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('task.cancel','取消本人预检','按版本取消本人预检任务及租约，取消后的迟到结果不得提交。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('task.retry','重试本人预检','按版本重试本人失败或取消的预检任务；仍须当前创建资格、来源授权及设备可用。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('analysis.read','查看本人逆向','读取本人逆向任务、状态和尝试记录，不取得其他成员任务或来源内容。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('analysis.create','创建逆向','选择本人设备及当前逐项授权来源创建逆向任务；运行时领取和回传重查授权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('analysis.cancel','取消本人逆向','按版本取消本人逆向任务及租约，取消后的迟到结果不得提交。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('analysis.retry','重试本人逆向','按版本重试本人失败或取消的逆向任务；仍须当前创建资格、来源授权及设备可用。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('candidate.read','查看本人候选','列出并在线读取本人候选；每次校验全部来源当前分析授权，不含ZIP下载。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('candidate.download','下载本人原包','下载本人完整候选ZIP；下载前后均重查候选和全部来源当前授权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('candidate.import','导入本人候选','通过本人设备导入固定契约候选包；必须校验全部来源当前授权和包完整性。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('review.read','查看本人相关审核','读取本人提交或显式指派给本人的审核及上下文，仍须全部来源当前分析授权。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('review.submit','提交本人候选审核','提交本人不可变候选进行自审或指定审核；不自动确认内容或发布。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;
INSERT INTO c2k_permission(code,name,description) VALUES ('review.decide','决定本人受派审核','仅审核显式提交给自己且全部来源授权有效的候选，自审无例外。') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;

-- 仅升级展开历史动作，生产授权接口不保留manage别名。
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'member.read' FROM c2k_role_permission WHERE permission_code='member.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'member.create' FROM c2k_role_permission WHERE permission_code='member.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'member.status' FROM c2k_role_permission WHERE permission_code='member.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'role.read' FROM c2k_role_permission WHERE permission_code='role.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'role.create' FROM c2k_role_permission WHERE permission_code='role.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'role.update' FROM c2k_role_permission WHERE permission_code='role.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'role.delete' FROM c2k_role_permission WHERE permission_code='role.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'role.assign' FROM c2k_role_permission WHERE permission_code='role.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'catalog.read' FROM c2k_role_permission WHERE permission_code='catalog.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'catalog.read.all' FROM c2k_role_permission WHERE permission_code='catalog.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'catalog.create' FROM c2k_role_permission WHERE permission_code='catalog.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'catalog.grant' FROM c2k_role_permission WHERE permission_code='catalog.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.read' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.read.all' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.create' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.update' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.status' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.grant' FROM c2k_role_permission WHERE permission_code='source.manage' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.analyze' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'source.read' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.read' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.create' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.cancel' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.retry' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.read' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.create' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.cancel' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.retry' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'candidate.read' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'candidate.download' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'candidate.import' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'review.read' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'review.submit' FROM c2k_role_permission WHERE permission_code='source.analyze' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'review.read' FROM c2k_role_permission WHERE permission_code='review.decide' ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'review.decide' FROM c2k_role_permission WHERE permission_code='review.decide' ON CONFLICT DO NOTHING;
DELETE FROM c2k_role_permission WHERE permission_code='member.manage';
DELETE FROM c2k_permission WHERE code='member.manage';
DELETE FROM c2k_role_permission WHERE permission_code='role.manage';
DELETE FROM c2k_permission WHERE code='role.manage';
DELETE FROM c2k_role_permission WHERE permission_code='catalog.manage';
DELETE FROM c2k_permission WHERE code='catalog.manage';
DELETE FROM c2k_role_permission WHERE permission_code='source.manage';
DELETE FROM c2k_permission WHERE code='source.manage';

-- 旧成员基础能力改为可撤销的企业角色；新成员无隐式动作，原资源标识和范围不变。
CREATE TEMP TABLE c2k_baseline_migration AS SELECT id AS tenant_id, gen_random_uuid()::varchar(36) AS role_id FROM c2k_tenant;
INSERT INTO c2k_role(id,tenant_id,name,description)
SELECT role_id, tenant_id, '历史基础访问-' || role_id, '升级保留原基础访问；可显式撤销，不含来源分析或审核权。' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'catalog.read' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'device.read' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'device.pair' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'device.revoke' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.read' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'task.cancel' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.read' FROM c2k_baseline_migration;
INSERT INTO c2k_role_permission(role_id,permission_code) SELECT role_id, 'analysis.cancel' FROM c2k_baseline_migration;
INSERT INTO c2k_member_role(tenant_id,member_id,role_id)
SELECT a.tenant_id,a.id,b.role_id FROM c2k_account a JOIN c2k_baseline_migration b ON b.tenant_id=a.tenant_id WHERE a.role='MEMBER';
DELETE FROM c2k_role_permission WHERE role_id='MEMBER';
UPDATE c2k_role SET description='已启用成员基础身份；业务动作必须由显式角色授予，资源范围另行授权。' WHERE id='MEMBER';
DROP TABLE c2k_baseline_migration;
INSERT INTO c2k_role_permission VALUES ('ADMIN','catalog.read') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','device.read') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','device.pair') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','device.revoke') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','task.read') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','task.cancel') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','analysis.read') ON CONFLICT DO NOTHING;
INSERT INTO c2k_role_permission VALUES ('ADMIN','analysis.cancel') ON CONFLICT DO NOTHING;

-- 历史角色补齐已确认前置；不授予资源范围。
WITH RECURSIVE dependency(code,required) AS (VALUES
    ('member.create'::varchar,'member.read'::varchar),
    ('member.status'::varchar,'member.read'::varchar),
    ('role.create'::varchar,'role.read'::varchar),
    ('role.update'::varchar,'role.read'::varchar),
    ('role.delete'::varchar,'role.read'::varchar),
    ('role.assign'::varchar,'role.read'::varchar),
    ('role.assign'::varchar,'member.read'::varchar),
    ('catalog.read.all'::varchar,'catalog.read'::varchar),
    ('catalog.create'::varchar,'catalog.read'::varchar),
    ('catalog.create'::varchar,'catalog.read.all'::varchar),
    ('catalog.grant'::varchar,'catalog.read'::varchar),
    ('catalog.grant'::varchar,'catalog.read.all'::varchar),
    ('source.read.all'::varchar,'source.read'::varchar),
    ('source.create'::varchar,'source.read'::varchar),
    ('source.create'::varchar,'source.read.all'::varchar),
    ('source.update'::varchar,'source.read'::varchar),
    ('source.update'::varchar,'source.read.all'::varchar),
    ('source.status'::varchar,'source.read'::varchar),
    ('source.status'::varchar,'source.read.all'::varchar),
    ('source.grant'::varchar,'source.read'::varchar),
    ('source.grant'::varchar,'source.read.all'::varchar),
    ('source.analyze'::varchar,'source.read'::varchar),
    ('device.pair'::varchar,'device.read'::varchar),
    ('device.revoke'::varchar,'device.read'::varchar),
    ('task.create'::varchar,'task.read'::varchar),
    ('task.create'::varchar,'source.read'::varchar),
    ('task.create'::varchar,'source.analyze'::varchar),
    ('task.create'::varchar,'device.read'::varchar),
    ('task.cancel'::varchar,'task.read'::varchar),
    ('task.retry'::varchar,'task.read'::varchar),
    ('task.retry'::varchar,'task.create'::varchar),
    ('analysis.create'::varchar,'analysis.read'::varchar),
    ('analysis.create'::varchar,'source.read'::varchar),
    ('analysis.create'::varchar,'source.analyze'::varchar),
    ('analysis.create'::varchar,'device.read'::varchar),
    ('analysis.cancel'::varchar,'analysis.read'::varchar),
    ('analysis.retry'::varchar,'analysis.read'::varchar),
    ('analysis.retry'::varchar,'analysis.create'::varchar),
    ('candidate.read'::varchar,'source.analyze'::varchar),
    ('candidate.download'::varchar,'candidate.read'::varchar),
    ('candidate.download'::varchar,'source.analyze'::varchar),
    ('candidate.import'::varchar,'candidate.read'::varchar),
    ('candidate.import'::varchar,'source.analyze'::varchar),
    ('review.read'::varchar,'source.analyze'::varchar),
    ('review.submit'::varchar,'review.read'::varchar),
    ('review.submit'::varchar,'source.analyze'::varchar),
    ('review.submit'::varchar,'candidate.read'::varchar),
    ('review.decide'::varchar,'review.read'::varchar),
    ('review.decide'::varchar,'source.analyze'::varchar)
), expanded(role_id,permission_code) AS (
    SELECT role_id,permission_code::varchar FROM c2k_role_permission
    UNION
    SELECT e.role_id,d.required FROM expanded e JOIN dependency d ON d.code=e.permission_code
)
INSERT INTO c2k_role_permission(role_id,permission_code)
SELECT role_id,permission_code FROM expanded ON CONFLICT DO NOTHING;
