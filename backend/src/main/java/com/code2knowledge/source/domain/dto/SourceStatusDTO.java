package com.code2knowledge.source.domain.dto;

import lombok.Data;

/** 来源启停请求；不能借启停权限更改定位、分支、类型或系统绑定。 */
@Data
public class SourceStatusDTO {
    /** 最新配置版本，必须显式提交，null非法。 */
    private Integer revision;
    /** true启用false停用，null非法。 */
    private Boolean enabled;
}
