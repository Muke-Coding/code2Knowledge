package com.code2knowledge.review.domain.entity;

import lombok.Data;

/** 审核持久化快照；不改候选、来源版本或发布状态。 */
@Data
public class ReviewDO {
    /** 审核UUID。 */
    private String id;
    /** 企业隔离UUID。 */
    private String tenantId;
    /** 不可变候选UUID。 */
    private String candidateId;
    /** 送审时资产摘要。 */
    private String digest;
    /** 送审成员UUID。 */
    private String submitterId;
    /** 指定审核成员UUID。 */
    private String reviewerId;
    /** 提交人当前显示名称，不作为身份依据。 */
    private String submitterName;
    /** 审核人当前显示名称，不作为身份依据。 */
    private String reviewerName;
    /** SELF自审或ASSIGNED指定他人。 */
    private String method;
    /** PENDING/CONFIRMED/REJECTED，确认不是发布。 */
    private String state;
    /** 控制版本，每次决定增加。 */
    private int revision;
    /** 审核意见，待审为空。 */
    private String comment;
    /** 提交幂等UUID。 */
    private String requestId;
    /** 提交时间ISO文本。 */
    private String createdAt;
    /** 决定时间，待审为空。 */
    private String decidedAt;
}
