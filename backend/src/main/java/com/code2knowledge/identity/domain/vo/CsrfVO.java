package com.code2knowledge.identity.domain.vo;

import lombok.Value;

/** 浏览器写保护令牌视图，仅同源客户端获取，不是身份访问令牌。 */
@Value
public class CsrfVO {
    /** 写请求须设置的HTTP头名称。 */
    String headerName;
    /** 绑定当前会话的CSRF值，不为空，不记录日志。 */
    String token;
}
