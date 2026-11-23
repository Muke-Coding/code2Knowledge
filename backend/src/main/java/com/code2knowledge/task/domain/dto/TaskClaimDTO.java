package com.code2knowledge.task.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 设备主动领取输入；只支持来源预检协议1。 */
@Getter
@Setter
public class TaskClaimDTO {
    /** 任务协议版本，必须1。 */
    private String version;
}
