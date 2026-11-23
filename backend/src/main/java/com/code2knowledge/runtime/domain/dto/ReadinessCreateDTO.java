package com.code2knowledge.runtime.domain.dto;

import lombok.Data;

/** 运行时启动前诊断输入；只选择设备和平台来源版本，不传本机路径或模型。 */
@Data
public class ReadinessCreateDTO {
    /** 本人设备UUID，不为空。 */
    private String deviceId;
    /** 明确INCLUDE或NONE。 */
    private String documentsChoice;
    /** 1至16个当前来源，至少一个仓库。 */
    private java.util.List<com.code2knowledge.task.domain.dto.AnalysisSourceDTO> sources;
}
