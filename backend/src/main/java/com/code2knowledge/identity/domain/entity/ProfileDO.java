package com.code2knowledge.identity.domain.entity;
import lombok.Value;
/** 本人资料持久化投影；仅身份服务使用，不携带密码摘要。 */
@Value
public class ProfileDO {
    /** 部署内唯一登录名。 */
    String username;
    /** 可修改显示名称。 */
    String displayName;
    /** 当前企业名称。 */
    String tenantName;
    /** 主部门名称，无归属为空串。 */
    String departmentName;
    /** 资料写入版本。 */
    int revision;
}
