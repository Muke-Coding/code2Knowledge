package com.code2knowledge.identity.domain.vo;

import lombok.Value;

/** 浏览器会话公开身份，不返回凭证与密码摘要。 */
@Value
public class SessionVO {
    /** 身份UUID，不为空。 */
    String id;
    /** 登录名，不为空。 */
    String username;
    /** 显示名称，不为空。 */
    String displayName;
    /** 企业名称，不为空。 */
    String tenantName;
    /** 受保护基础身份ADMIN或MEMBER；当前动作以permissions及服务端重查为准。 */
    String role;
    /** 当前内置与自定义角色动作并集；只作界面提示，服务端每次重查。 */
    java.util.List<String> permissions;
    /** 当前动作过滤后的导航项；为空时进入无可用功能页。 */
    java.util.List<com.code2knowledge.authorization.domain.vo.NavigationVO> navigation;
}
