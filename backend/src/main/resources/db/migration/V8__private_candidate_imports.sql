-- 候选仅导入者可读；正文保存在不可变对象，数据库只存清单和当前来源绑定，不赋予发布语义。
CREATE TABLE c2k_candidate (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL,
    owner_id varchar(36) NOT NULL,
    device_id varchar(36) NOT NULL REFERENCES c2k_device(id),
    request_id varchar(36) NOT NULL,
    digest varchar(64) NOT NULL,
    archive_sha256 varchar(64) NOT NULL,
    archive_bytes bigint NOT NULL,
    report text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, owner_id, request_id),
    FOREIGN KEY (tenant_id, owner_id) REFERENCES c2k_account(tenant_id, id)
);
CREATE TABLE c2k_candidate_source (
    candidate_id varchar(36) NOT NULL REFERENCES c2k_candidate(id),
    tenant_id varchar(36) NOT NULL,
    source_id varchar(36) NOT NULL,
    source_revision integer NOT NULL,
    repository varchar(200) NOT NULL,
    commit_id varchar(64) NOT NULL,
    PRIMARY KEY(candidate_id, repository),
    FOREIGN KEY (tenant_id, source_id) REFERENCES c2k_source(tenant_id, id)
);
CREATE INDEX c2k_candidate_owner ON c2k_candidate(tenant_id, owner_id, created_at DESC, id);
