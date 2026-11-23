package com.code2knowledge.task.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 任务取消/重试输入，显式控制版本防覆盖。 */
@Getter
@Setter
public class TaskControlDTO {
    /** 当前任务控制版本，不能为空。 */
    private Integer revision;
}
