package com.code2knowledge.candidate.domain.vo;

import lombok.Value;

/** 候选在线文本响应，权限及完整性重查后返回。 */
@Value
public class CandidateContentVO {
    /** 资产相对路径，必须在不可变清单中。 */
    String path;
    /** 原始UTF8字节摘要。 */
    String sha256;
    /** 最大512KiB原文，不作为HTML执行。 */
    String content;
}
