package com.code2knowledge.review.domain.vo;

import lombok.Value;

/** 仅当前候选可送审的成员选择摘要。 */
@Value
public class ReviewerVO {
    /** 已启用且具备审核动作和全部来源授权的成员UUID。 */
    String id;
    /** 同企业审核人显示名。 */
    String displayName;
}
