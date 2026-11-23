package com.code2knowledge.review.domain.dto;

import lombok.Data;

/** 候选送审请求；不自动确认业务或发布。 */
@Data
public class SubmitReviewDTO {
    /** 本人不可变候选UUID。 */
    private String candidateId;
    /** 显式审核成员UUID，可为本人，仍需审核动作。 */
    private String reviewerId;
    /** 提交幂等UUID，同键不允许不同候选或审核人。 */
    private String requestId;
}
