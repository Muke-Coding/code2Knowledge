package com.code2knowledge.review.domain.vo;

import lombok.Value;

/** 当前本人可见审核，不代表条目逐项确认或发布。 */
@Value
public class ReviewVO {
    /** 审核UUID。 */
    String id;
    /** 不可变候选UUID。 */
    String candidateId;
    /** 送审时资产摘要。 */
    String digest;
    /** 送审成员UUID。 */
    String submitterId;
    /** 指定审核成员UUID。 */
    String reviewerId;
    /** 提交人当前显示名称，不作为身份依据。 */
    String submitterName;
    /** 审核人当前显示名称，不作为身份依据。 */
    String reviewerName;
    /** SELF自审或ASSIGNED指定他人。 */
    String method;
    /** PENDING/CONFIRMED/REJECTED，确认不是发布。 */
    String state;
    /** 控制版本，每次决定增加。 */
    int revision;
    /** 审核意见，待审为空。 */
    String comment;
    /** 提交时间ISO文本。 */
    String createdAt;
    /** 决定时间，待审为空。 */
    String decidedAt;
}
