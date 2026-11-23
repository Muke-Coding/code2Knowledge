-- 审核动作可通过角色显式授予；管理员不默认获得内容授权或审核权。
INSERT INTO c2k_permission VALUES ('review.decide', '候选业务审核', '审核显式提交给自己的候选，仍需全部来源当前分析授权；支持自审，不代表发布。');
CREATE TABLE c2k_review (
    id varchar(36) PRIMARY KEY,
    tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
    candidate_id varchar(36) NOT NULL REFERENCES c2k_candidate(id),
    digest varchar(64) NOT NULL,
    submitter_id varchar(36) NOT NULL,
    reviewer_id varchar(36) NOT NULL,
    method varchar(10) NOT NULL CHECK (method IN ('SELF','ASSIGNED')),
    state varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CONFIRMED','REJECTED')),
    revision integer NOT NULL DEFAULT 0,
    comment varchar(2000) NOT NULL DEFAULT '',
    request_id varchar(36) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    decided_at timestamptz,
    UNIQUE (tenant_id, submitter_id, request_id),
    FOREIGN KEY (tenant_id, submitter_id) REFERENCES c2k_account(tenant_id, id),
    FOREIGN KEY (tenant_id, reviewer_id) REFERENCES c2k_account(tenant_id, id)
);
-- 同候选只能存在一次在途审核；驳回/确认后可重新送审，历史保留。
CREATE UNIQUE INDEX c2k_review_one_pending ON c2k_review(candidate_id) WHERE state = 'PENDING';
CREATE INDEX c2k_review_reviewer ON c2k_review(tenant_id, reviewer_id, created_at DESC);
