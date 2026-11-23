package com.code2knowledge.source.domain.vo;

import lombok.Value;

/** 来源资源授权视图；失效版本仍可见以明确需要重新授权。 */
@Value
public class SourceGrantVO {
    /** 被授权同企业成员UUID，可包含引导管理员。 */
    String memberId;
    /** 被授权成员公开名称。 */
    String displayName;
    /** 授权时的来源配置版本。 */
    int sourceRevision;
    /** 是否仍匹配当前来源配置；不等于成员已有角色动作或设备访问权。 */
    boolean current;
}
