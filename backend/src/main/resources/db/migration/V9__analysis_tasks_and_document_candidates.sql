-- 逆向定义与来源版本独立于预检，沿用任务尝试/租约/设备容量；不保存模型配置或密钥。
CREATE TABLE c2k_analysis_spec (
    task_id varchar(36) PRIMARY KEY REFERENCES c2k_task(id),
    product varchar(80) NOT NULL,
    domain_name varchar(80) NOT NULL,
    scope varchar(2000) NOT NULL,
    documents_choice varchar(10) NOT NULL CHECK (documents_choice IN ('INCLUDE','NONE'))
);
CREATE TABLE c2k_task_source (
    task_id varchar(36) NOT NULL REFERENCES c2k_task(id),
    source_id varchar(36) NOT NULL REFERENCES c2k_source(id),
    source_revision integer NOT NULL CHECK (source_revision >= 0),
    alias varchar(80) NOT NULL,
    kind varchar(20) NOT NULL CHECK (kind IN ('REPOSITORY','DOCUMENT')),
    branch varchar(200) NOT NULL,
    locator varchar(1000) NOT NULL,
    PRIMARY KEY (task_id, source_id),
    UNIQUE (task_id, alias)
);
ALTER TABLE c2k_candidate_source ADD COLUMN kind varchar(10) NOT NULL DEFAULT 'code';
ALTER TABLE c2k_candidate_source ADD COLUMN path varchar(512) NOT NULL DEFAULT '';
ALTER TABLE c2k_candidate ADD COLUMN mode varchar(12) NOT NULL DEFAULT 'IMPORTED';
ALTER TABLE c2k_candidate ADD COLUMN task_id varchar(36) REFERENCES c2k_task(id);
ALTER TABLE c2k_candidate ADD COLUMN attempt_id varchar(36) UNIQUE REFERENCES c2k_task_attempt(id);

-- 同名代码别名和document_id在各自类别独立，不应发生数据库主键碰撞。
ALTER TABLE c2k_candidate_source DROP CONSTRAINT c2k_candidate_source_pkey;
ALTER TABLE c2k_candidate_source ADD PRIMARY KEY (candidate_id, kind, repository);
ALTER TABLE c2k_candidate ADD CONSTRAINT c2k_candidate_mode_check CHECK (mode IN ('IMPORTED','EXECUTED'));
