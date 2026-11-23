package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 本人本次设备来源选择的短期就绪检查；仅诊断，不作为任务执行票据。 */
@Value
public class ReadinessVO {
    /** 检查UUID；空领取为空串。 */
    String id;
    /** 检查状态：PENDING/CHECKING/COMPLETE/EXPIRED。 */
    String state;
    /** 平台UTC期限，无项为空。 */
    String expiresAt;
    /** 本次授权来源，空领取为空列表。 */
    java.util.List<com.code2knowledge.task.domain.vo.AnalysisSourceVO> sources;
    /** 完整检查或尚无结果空列表。 */
    java.util.List<ReadinessCheckVO> checks;
}
