package com.code2knowledge.task.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 来源预检创建输入；不含任意命令、凭证、绝对目录或模型参数。 */
@Getter
@Setter
public class CreateTaskDTO {
    /** 任务名称，1至120字符。 */
    private String name;
    /** 仓库来源UUID，必须当前逐项授权。 */
    private String sourceId;
    /** 用户确认的来源配置版本，必填。 */
    private Integer sourceRevision;
    /** 当前所有者有效私有设备UUID。 */
    private String deviceId;
    /** 本次创建幂等UUID；重试相同请求使用同一值。 */
    private String requestId;
}
