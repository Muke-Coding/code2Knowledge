-- 启停账户递增认证版本；禁止重新启用后恢复旧浏览器会话。
ALTER TABLE c2k_account ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
