package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 本人逆向任务分页 */
@Value
public class AnalysisPageVO {
    /** 当前页任务。 */
    java.util.List<AnalysisTaskVO> items;
    /** 从1开始页码。 */
    int page;
    /** 当前成员任务数量。 */
    int total;
}
