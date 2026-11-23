package com.code2knowledge.task.domain.dto;

import lombok.Data;

/** 逆向来源选择；不允许请求携带本机路径或覆盖来源分支。 */
@Data
public class AnalysisSourceDTO {
    /** 平台来源UUID，必须逐项授权。 */
    private String sourceId;
    /** 用户明确选择的来源配置版本。 */
    private Integer revision;
    /** 本次稳定材料标识，代码对应repository，资料用于document_id前缀。 */
    private String alias;
}
