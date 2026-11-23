package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 固定脱敏检查结果；状态由设备自报，不能证明模型连通或隔离可信。 */
@Value
public class ReadinessCheckVO {
    /** 固定NODE/GIT/SKILL/AGENT/CREDENTIAL/MATERIALS。 */
    String code;
    /** PASS/FAIL/NOT_CHECKED；不允许任意日志。 */
    String status;
}
