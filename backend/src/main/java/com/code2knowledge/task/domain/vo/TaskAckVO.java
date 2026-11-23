package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 设备操作确认；valid=false必须终止当前执行，不能提交旧结果。 */
@Value
public class TaskAckVO {
    /** 当前租约与策略是否仍有效。 */
    boolean valid;
    /** 本次服务端确认状态，无可见任务时REJECTED。 */
    String state;
}
