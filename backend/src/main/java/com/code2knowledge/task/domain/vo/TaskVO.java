package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 私有来源预检任务公开视图；成功仅表示来源清单已接收，不是逆向完成或知识发布。 */
@Value
public class TaskVO {
    /** 任务稳定UUID。 */
    String id;
    /** 已授权仓库来源UUID。 */
    String sourceId;
    /** 创建时来源名称快照，不随目录改名。 */
    String sourceName;
    /** 创建时来源配置版本，变化后拒绝执行。 */
    int sourceRevision;
    /** 明确选择的本地Git分支，不代表远端最新。 */
    String branch;
    /** 所有者私有设备UUID。 */
    String deviceId;
    /** 创建时设备名快照。 */
    String deviceName;
    /** 预检任务名称，不含脚本。 */
    String name;
    /** 任务控制版本，用于并发取消或重试。 */
    int revision;
    /** 当前尝试序号，从1开始。 */
    int attemptNumber;
    /** 当前执行尝试UUID。 */
    String attemptId;
    /** 尝试状态：QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED。 */
    String state;
    /** 固定Git完整commit，未完成为空字符串。 */
    String commitId;
    /** 本地隔离归档摘要，未完成为空字符串。 */
    String archiveSha256;
    /** 已提交树中的条目数，未完成为0。 */
    int fileCount;
    /** 本地隔离归档字节数，未完成为0。 */
    long archiveBytes;
    /** 固定可公开状态说明，不接受任意设备日志。 */
    String message;
    /** 任务UTC创建时间。 */
    String createdAt;
    /** 本次尝试UTC更新时间。 */
    String updatedAt;
}
