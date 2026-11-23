package com.code2knowledge.review.domain.dto;

import lombok.Data;

/** 审核决定请求；绑定原候选摘要不改写知识原包。 */
@Data
public class DecideReviewDTO {
    /** 当前审核版本，拒绝并发覆盖。 */
    private Integer revision;
    /** CONFIRMED或REJECTED，不接受其他状态。 */
    private String decision;
    /** 审核意见1至2000字符，确认和驳回均需说明依据。 */
    private String comment;
}
