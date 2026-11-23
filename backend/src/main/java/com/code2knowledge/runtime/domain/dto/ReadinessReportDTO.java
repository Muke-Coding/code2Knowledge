package com.code2knowledge.runtime.domain.dto;

import lombok.Data;

/** 设备只上报固定检查状态；不接受模型配置、路径、日志或任意说明。 */
@Data
public class ReadinessReportDTO {
    /** 完整六项，无重复，不得为null。 */
    private java.util.List<ReadinessCheckDTO> checks;
}
