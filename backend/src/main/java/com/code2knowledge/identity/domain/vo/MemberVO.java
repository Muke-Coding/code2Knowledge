package com.code2knowledge.identity.domain.vo;

import lombok.Value;

/** 同企业成员管理视图，不包含密码和登录失败信息。 */
@Value
public class MemberVO {
    /** 成员UUID，不为空。 */
    String id;
    /** 登录名，不为空。 */
    String username;
    /** 显示名称，不为空。 */
    String displayName;
    /** 受保护基础身份ADMIN或MEMBER，不包含附加角色列表。 */
    String role;
    /** 是否启用。 */
    boolean enabled;
}
