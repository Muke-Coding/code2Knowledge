-- 授权事件保存被授权主体ID，其他事件允许为空；不记录密码与目录正文。
ALTER TABLE c2k_audit ADD COLUMN subject_id varchar(36);
