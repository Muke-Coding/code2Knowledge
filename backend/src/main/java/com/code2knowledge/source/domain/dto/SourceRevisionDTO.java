package com.code2knowledge.source.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 分析检查和来源资源授权的版本前提。 */
@Getter
@Setter
public class SourceRevisionDTO {
    /** 显式来源配置版本；检查或授予前必须匹配当前值。 */
    private Integer revision;
}
