package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 当前成员私有任务分页，无跨所有者管理例外。 */
@Value
public class TaskPageVO {
    /** 当前页任务。 */
    java.util.List<TaskVO> items;
    /** 从1开始页码。 */
    int page;
    /** 当前成员任务数量。 */
    int total;
}
