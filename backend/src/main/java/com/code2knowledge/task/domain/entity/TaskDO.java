package com.code2knowledge.task.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 任务与当前尝试的内部数据库事实；不向浏览器序列化租约。 */
@Getter
@Setter
public class TaskDO {
    /** 任务稳定UUID。 */
    private String id;
    /** 可信企业UUID，仅服务内。 */
    private String tenantId;
    /** 创建成员UUID，私有任务不共享。 */
    private String ownerId;
    /** 已授权仓库来源UUID。 */
    private String sourceId;
    /** 创建时来源名称快照，不随目录改名。 */
    private String sourceName;
    /** 创建时来源配置版本，变化后拒绝执行。 */
    private int sourceRevision;
    /** 明确选择的本地Git分支，不代表远端最新。 */
    private String branch;
    /** 所有者私有设备UUID。 */
    private String deviceId;
    /** 创建时设备名快照。 */
    private String deviceName;
    /** 预检任务名称，不含脚本。 */
    private String name;
    /** 客户端创建幂等UUID，同用户不能复用不同配置。 */
    private String requestId;
    /** 任务控制版本，用于并发取消或重试。 */
    private int revision;
    /** 当前尝试序号，从1开始。 */
    private int attemptNumber;
    /** 当前执行尝试UUID。 */
    private String attemptId;
    /** 尝试状态：QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED。 */
    private String state;
    /** 仅设备协议使用的租约标识，不返回浏览器。 */
    private String leaseId;
    /** 数据库时钟判断的当前租约是否过期。 */
    private boolean expired;
    /** 固定Git完整commit，未完成为空字符串。 */
    private String commitId;
    /** 本地隔离归档摘要，未完成为空字符串。 */
    private String archiveSha256;
    /** 已提交树中的条目数，未完成为0。 */
    private int fileCount;
    /** 本地隔离归档字节数，未完成为0。 */
    private long archiveBytes;
    /** 固定可公开状态说明，不接受任意设备日志。 */
    private String message;
    /** 任务UTC创建时间。 */
    private String createdAt;
    /** 本次尝试UTC更新时间。 */
    private String updatedAt;
}
