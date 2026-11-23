-- 短期诊断不是任务，不读取源码正文，不存模型与本机配置；期限由数据库判断。
CREATE TABLE c2k_runtime_readiness (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL,
    owner_id varchar(36) NOT NULL,
    device_id varchar(36) NOT NULL REFERENCES c2k_device(id),
    state varchar(12) NOT NULL CHECK (state IN ('PENDING','CHECKING','COMPLETE')),
    sources_json text NOT NULL,
    checks_json text NOT NULL DEFAULT '[]',
    expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '120 seconds',
    FOREIGN KEY (tenant_id,owner_id) REFERENCES c2k_account(tenant_id,id)
);
CREATE INDEX c2k_readiness_device ON c2k_runtime_readiness(tenant_id,device_id,expires_at);
