package com.code2knowledge.candidate.domain.vo;

import lombok.Value;

/** 私有候选授权分页；列表和总数均在全部当前来源权限过滤后计算，固定每页20条。 */
@Value
public class CandidatePageVO {
    /** 当前授权下本人候选。 */
    java.util.List<CandidateVO> items;
    /** 从1开始页码。 */
    int page;
    /** 当前可读候选总数。 */
    int total;
}
