package com.code2knowledge.identity.domain.vo;
import lombok.Value;
import java.util.List;
/** 本人账户资料；登录名、企业、角色和部门只读，不返回密码或设备凭证。 */
@Value
public class ProfileVO {
    /** 部署内登录名，不可修改。 */
    String username;
    /** 可自行修改的显示名称。 */
    String displayName;
    /** 当前企业显示名称。 */
    String tenantName;
    /** 当前主部门名称，未分配为空字符串。 */
    String departmentName;
    /** 当前基础及自定义角色名称，空列表不代表具有默认业务权限。 */
    List<String> roles;
    /** 显示资料乐观版本，角色和部门变化不由此版本控制。 */
    int revision;
}
