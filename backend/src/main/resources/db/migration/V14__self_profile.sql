-- 本人显示资料使用独立乐观版本，不改变既有认证版本或权限范围。
ALTER TABLE c2k_account ADD COLUMN profile_revision integer NOT NULL DEFAULT 0;
