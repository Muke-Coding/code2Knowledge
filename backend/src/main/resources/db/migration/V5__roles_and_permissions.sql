-- 内置角色全部署只读；自定义角色按企业隔离，账户role仅保留受保护基础身份。
CREATE TABLE c2k_permission (
    code varchar(64) PRIMARY KEY,
    name varchar(80) NOT NULL,
    description varchar(300) NOT NULL
);
INSERT INTO c2k_permission VALUES
('member.manage', '成员管理', '查看、创建和启停普通成员，不包含角色分配。'),
('role.manage', '角色与授权管理', '创建、修改角色及分配成员角色，属于可委派管理权限的高权限。'),
('catalog.manage', '系统目录管理', '维护全企业系统目录元数据及目录读取授权，不包含知识或源码。'),
('catalog.read', '系统目录读取', '只读取已获资源授权的系统目录元数据。');
CREATE TABLE c2k_role (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) REFERENCES c2k_tenant(id),
    name varchar(80) NOT NULL,
    description varchar(300) NOT NULL,
    built_in boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, id),
    CHECK ((built_in AND tenant_id IS NULL AND id IN ('ADMIN', 'MEMBER'))
        OR (NOT built_in AND tenant_id IS NOT NULL))
);
INSERT INTO c2k_role(id,name,description,built_in) VALUES
('ADMIN', '引导管理员', '受保护基础角色；管理平台元数据，不自动获得知识、源码内容权。', true),
('MEMBER', '基础成员', '已启用成员默认具有目录读取资格，具体系统仍需资源授权；私有设备仅自己管理。', true);
CREATE TABLE c2k_role_permission (
    role_id varchar(36) NOT NULL REFERENCES c2k_role(id),
    permission_code varchar(64) NOT NULL REFERENCES c2k_permission(code),
    PRIMARY KEY (role_id, permission_code)
);
INSERT INTO c2k_role_permission SELECT 'ADMIN', code FROM c2k_permission;
INSERT INTO c2k_role_permission VALUES ('MEMBER', 'catalog.read');
CREATE TABLE c2k_member_role (
    tenant_id varchar(36) NOT NULL,
    member_id varchar(36) NOT NULL,
    role_id varchar(36) NOT NULL,
    PRIMARY KEY (tenant_id, member_id, role_id),
    FOREIGN KEY (tenant_id, member_id) REFERENCES c2k_account(tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES c2k_role(tenant_id, id)
);
CREATE INDEX c2k_member_role_role ON c2k_member_role(tenant_id, role_id);
-- 角色授权变更版本用于并发编辑冲突；其他策略缓存暂未实施，禁止宣称已有全局policy_epoch。
ALTER TABLE c2k_account ADD COLUMN role_revision integer NOT NULL DEFAULT 0;
