package com.code2knowledge.source.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 来源成员授权请求，不隐含角色或设备授权。 */
@Getter
@Setter
public class SourceGrantDTO {
    /** 授权或撤销目标，必须同企业；管理员也需显式资源授权。 */
    private String memberId;
    /** 当前来源配置版本，过期409。 */
    private Integer revision;
}
