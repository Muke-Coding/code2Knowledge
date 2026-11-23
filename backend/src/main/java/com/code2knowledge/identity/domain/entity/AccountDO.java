package com.code2knowledge.identity.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 身份持久化对象，仅供身份服务与Mapper使用；密码摘要不得转换为HTTP响应。 */
@Getter
@Setter
public class AccountDO {
    /** 身份UUID，不为空。 */
    private String id;
    /** 所属企业UUID，不为空。 */
    private String tenantId;
    /** 部署内唯一登录名，不为空。 */
    private String username;
    /** 成员显示名称，不为空。 */
    private String displayName;
    /** BCrypt密码摘要，不为空，禁止日志和响应输出。 */
    private String passwordHash;
    /** 受保护基础身份ADMIN或MEMBER；当前动作必须查RBAC，不代表知识内容权。 */
    private String role;
    /** 认证版本，启停递增；旧会话版本不能继续使用。 */
    private int authVersion;
    /** 是否允许登录和使用既有会话。 */
    private boolean enabled;
}
