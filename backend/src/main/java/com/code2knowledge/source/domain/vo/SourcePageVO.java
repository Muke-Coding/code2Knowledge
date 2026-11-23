package com.code2knowledge.source.domain.vo;

import lombok.Value;

/** 服务端分页来源结果；每页20项，搜索和数量采用同一授权过滤。 */
@Value
public class SourcePageVO {
    /** 当前页可见来源，无结果为空数组。 */
    java.util.List<SourceVO> items;
    /** 当前页，从1开始。 */
    int page;
    /** 只统计当前主体可见来源，不泄漏其他资源数量。 */
    int total;
}
