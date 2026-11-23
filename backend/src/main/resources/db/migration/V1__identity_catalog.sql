-- 企业是隔离边界；本轮仅目录授权，不将管理角色等同于知识阅读。
CREATE TABLE c2k_tenant (
    id varchar(36) PRIMARY KEY,
    name varchar(120) NOT NULL
);
CREATE TABLE c2k_account (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
    username varchar(64) NOT NULL UNIQUE,
    display_name varchar(80) NOT NULL,
    password_hash varchar(100) NOT NULL,
    role varchar(16) NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
    enabled boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id, id)
);
CREATE TABLE c2k_system (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
    name varchar(120) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, id)
);
-- 复合外键在数据库层阻止跨企业授权；catalog.read仅表示目录元数据。
CREATE TABLE c2k_system_grant (
    tenant_id varchar(36) NOT NULL,
    system_id varchar(36) NOT NULL,
    member_id varchar(36) NOT NULL,
    action varchar(32) NOT NULL CHECK (action = 'catalog.read'),
    PRIMARY KEY (tenant_id, system_id, member_id, action),
    FOREIGN KEY (tenant_id, system_id) REFERENCES c2k_system(tenant_id, id),
    FOREIGN KEY (tenant_id, member_id) REFERENCES c2k_account(tenant_id, id)
);
CREATE TABLE c2k_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
    actor_id varchar(36) NOT NULL,
    event varchar(64) NOT NULL,
    target_id varchar(36) NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX c2k_system_grant_member ON c2k_system_grant(tenant_id, member_id, system_id);
