package com.code2knowledge.runtime.domain.dto;

import lombok.Data;

/** 设备输入固定检查项；仅允许协议代码与状态，不接受路径、正文或日志。 */
@Data
public class ReadinessCheckDTO {
    /** NODE、GIT、SKILL、AGENT、CREDENTIAL或MATERIALS。 */
    private String code;
    /** PASS、FAIL或NOT_CHECKED，不表示模型连通或语义质量。 */
    private String status;
}
