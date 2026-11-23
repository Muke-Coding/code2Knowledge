package com.code2knowledge.review.domain.vo;

import lombok.Value;

/** 审核分页，无隐藏对象计数。 */
@Value
public class ReviewPageVO {
    /** 当前有全部来源授权的本人提交/受派审核。 */
    java.util.List<ReviewVO> items;
    /** 起始1，每页20。 */
    int page;
    /** 授权过滤后的记录数。 */
    int total;
}
