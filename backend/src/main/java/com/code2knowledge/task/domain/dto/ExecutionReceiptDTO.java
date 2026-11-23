package com.code2knowledge.task.domain.dto;

import lombok.Data;

/** 逆向结果提交的租约凭证；不能用于普通导入，不含模型密钥。 */
@Data
public class ExecutionReceiptDTO {
    /** 私有逆向任务UUID。 */
    private String taskId;
    /** 当前尝试UUID。 */
    private String attemptId;
    /** 当前设备租约UUID，不记录日志。 */
    private String leaseId;
    /** 当前尝试序号，拒绝旧尝试。 */
    private Integer fence;
}
