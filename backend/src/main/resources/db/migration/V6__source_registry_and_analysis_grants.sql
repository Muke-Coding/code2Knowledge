-- 来源元数据不包含凭证或文档正文；登记不会触发网络、Git或文件读取。
INSERT INTO c2k_permission VALUES
('source.manage', '来源与分析授权管理', '维护全企业来源元数据、系统关联和成员分析授权，可读取授权选择所需成员/系统摘要。'),
('source.analyze', '来源分析资格', '仅对另行逐项授权且版本有效的来源检查分析资格，不自动获得源码或知识。');
-- 引导管理员只有动作资格，没有任何默认来源ACL；普通成员需自定义角色授予动作。
INSERT INTO c2k_role_permission VALUES ('ADMIN', 'source.manage'), ('ADMIN', 'source.analyze');
CREATE TABLE c2k_source (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
    name varchar(120) NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('REPOSITORY', 'DOCUMENT')),
    locator varchar(1000) NOT NULL,
    branch varchar(200) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, kind, locator),
    CHECK ((kind = 'REPOSITORY' AND branch <> '') OR (kind = 'DOCUMENT' AND branch = ''))
);
-- 一个来源可关联多个系统，不复制仓库身份；关联绝不继承系统目录权限。
CREATE TABLE c2k_source_system (
    tenant_id varchar(36) NOT NULL,
    source_id varchar(36) NOT NULL,
    system_id varchar(36) NOT NULL,
    PRIMARY KEY (tenant_id, source_id, system_id),
    FOREIGN KEY (tenant_id, source_id) REFERENCES c2k_source(tenant_id, id),
    FOREIGN KEY (tenant_id, system_id) REFERENCES c2k_system(tenant_id, id)
);
-- 绑定来源配置版本，改定位/分支/关联/状态后旧授权不能复活。
CREATE TABLE c2k_source_grant (
    tenant_id varchar(36) NOT NULL,
    source_id varchar(36) NOT NULL,
    member_id varchar(36) NOT NULL,
    source_revision integer NOT NULL,
    PRIMARY KEY (tenant_id, source_id, member_id),
    FOREIGN KEY (tenant_id, source_id) REFERENCES c2k_source(tenant_id, id),
    FOREIGN KEY (tenant_id, member_id) REFERENCES c2k_account(tenant_id, id)
);
CREATE INDEX c2k_source_grant_member ON c2k_source_grant(tenant_id, member_id, source_id);
