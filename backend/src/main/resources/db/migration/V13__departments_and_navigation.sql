-- 部门仅作为显式授权主体，历史成员不自动分配部门或扩大任何范围。
CREATE TABLE c2k_department (
 id varchar(36) PRIMARY KEY,
 tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
 parent_id varchar(36),
 name varchar(80) NOT NULL,
 sort_order integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 0,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES c2k_department(tenant_id,id),
 CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE UNIQUE INDEX c2k_department_name ON c2k_department(tenant_id,COALESCE(parent_id,''),name);
CREATE TABLE c2k_member_department (
 tenant_id varchar(36) NOT NULL,
 member_id varchar(36) NOT NULL,
 department_id varchar(36),
 revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,member_id),
 FOREIGN KEY(tenant_id,member_id) REFERENCES c2k_account(tenant_id,id),
 FOREIGN KEY(tenant_id,department_id) REFERENCES c2k_department(tenant_id,id)
);
CREATE TABLE c2k_department_grant (
 tenant_id varchar(36) NOT NULL,
 department_id varchar(36) NOT NULL,
 resource_kind varchar(12) NOT NULL CHECK(resource_kind IN ('SYSTEM','SOURCE')),
 resource_id varchar(36) NOT NULL,
 source_revision integer NOT NULL,
 include_children boolean NOT NULL,
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,department_id,resource_kind,resource_id),
 FOREIGN KEY(tenant_id,department_id) REFERENCES c2k_department(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE c2k_menu_setting (
 tenant_id varchar(36) NOT NULL REFERENCES c2k_tenant(id),
 path varchar(80) NOT NULL,
 title varchar(80) NOT NULL,
 group_key varchar(24) NOT NULL,
 group_title varchar(80) NOT NULL,
 sort_order integer NOT NULL,
 visible boolean NOT NULL,
 revision integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,path)
);
-- 权限增量由permissions.json生成；历史V11保持不变。
INSERT INTO c2k_permission(code,name,description) VALUES('department.read','查看部门','查看部门，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','department.read');
INSERT INTO c2k_permission(code,name,description) VALUES('department.create','新增部门','新增部门，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','department.create');
INSERT INTO c2k_permission(code,name,description) VALUES('department.update','编辑部门','编辑部门，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','department.update');
INSERT INTO c2k_permission(code,name,description) VALUES('department.delete','删除部门','删除部门，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','department.delete');
INSERT INTO c2k_permission(code,name,description) VALUES('department.assign','分配成员部门','分配成员部门，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','department.assign');
INSERT INTO c2k_permission(code,name,description) VALUES('menu.read','查看菜单','查看菜单，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','menu.read');
INSERT INTO c2k_permission(code,name,description) VALUES('menu.update','配置菜单','配置菜单，仅限当前企业；不自动授予来源或知识读取权。');
INSERT INTO c2k_role_permission(role_id,permission_code) VALUES('ADMIN','menu.update');
