-- 私有设备仅归属创建配对的成员；不授予源、模型或知识内容权限。
CREATE TABLE c2k_pairing (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL,
    owner_id varchar(36) NOT NULL,
    owner_version integer NOT NULL,
    code_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    consumed boolean NOT NULL DEFAULT false,
    FOREIGN KEY (tenant_id, owner_id) REFERENCES c2k_account(tenant_id, id)
);
CREATE INDEX c2k_pairing_owner ON c2k_pairing(tenant_id, owner_id);
CREATE TABLE c2k_device (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL,
    owner_id varchar(36) NOT NULL,
    owner_version integer NOT NULL,
    name varchar(80) NOT NULL,
    os varchar(32) NOT NULL,
    arch varchar(32) NOT NULL,
    version varchar(16) NOT NULL,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    last_seen timestamptz,
    revoked boolean NOT NULL DEFAULT false,
    FOREIGN KEY (tenant_id, owner_id) REFERENCES c2k_account(tenant_id, id)
);
CREATE INDEX c2k_device_owner ON c2k_device(tenant_id, owner_id);
