-- 私有来源预检任务，归档留设备；平台只接收无正文清单。控制版本与尝试隔离，旧租约不可覆盖新结果。
CREATE TABLE c2k_task (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL,
    owner_id varchar(36) NOT NULL,
    source_id varchar(36) NOT NULL,
    source_name varchar(120) NOT NULL,
    source_revision integer NOT NULL,
    branch varchar(200) NOT NULL,
    device_id varchar(36) NOT NULL,
    device_name varchar(80) NOT NULL,
    name varchar(120) NOT NULL,
    request_id varchar(36) NOT NULL,
    revision integer NOT NULL DEFAULT 0,
    attempt_number integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, owner_id, request_id),
    FOREIGN KEY (tenant_id, owner_id) REFERENCES c2k_account(tenant_id, id),
    FOREIGN KEY (tenant_id, source_id) REFERENCES c2k_source(tenant_id, id),
    FOREIGN KEY (device_id) REFERENCES c2k_device(id)
);
CREATE TABLE c2k_task_attempt (
    id varchar(36) PRIMARY KEY,
    task_id varchar(36) NOT NULL REFERENCES c2k_task(id),
    number integer NOT NULL,
    state varchar(20) NOT NULL CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
    lease_id varchar(36) NOT NULL DEFAULT '',
    lease_until timestamptz,
    commit_id varchar(64) NOT NULL DEFAULT '',
    archive_sha256 varchar(64) NOT NULL DEFAULT '',
    file_count integer NOT NULL DEFAULT 0,
    archive_bytes bigint NOT NULL DEFAULT 0,
    message varchar(120) NOT NULL DEFAULT '等待设备领取',
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (task_id, number)
);
CREATE INDEX c2k_task_owner ON c2k_task(tenant_id, owner_id, created_at DESC, id);
CREATE INDEX c2k_task_device ON c2k_task(tenant_id, device_id, created_at, id);
