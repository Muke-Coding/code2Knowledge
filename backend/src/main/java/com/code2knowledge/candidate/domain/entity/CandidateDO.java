package com.code2knowledge.candidate.domain.entity;

import lombok.Data;

/** 候选持久化元数据；记录不可变导入身份、原包摘要和无正文清单，原包由对象存储端口保存，不作为知识发布记录。 */
@Data
public class CandidateDO {
    /** IMPORTED或EXECUTED；原有审核标记不因此升级。 */
    private String mode;
    /** 平台执行关联的任务UUID；导入null。 */
    private String taskId;
    /** 平台执行关联的尝试UUID；导入null。 */
    private String attemptId;
    /** 候选UUID。 */
    private String id;
    /** 企业UUID。 */
    private String tenantId;
    /** 导入者UUID。 */
    private String ownerId;
    /** 实际提交设备UUID。 */
    private String deviceId;
    /** 客户端幂等UUID。 */
    private String requestId;
    /** 知识内容指纹。 */
    private String digest;
    /** 原始ZIP摘要。 */
    private String archiveSha256;
    /** ZIP字节数。 */
    private long archiveBytes;
    /** 固定校验器JSON清单，不含正文。 */
    private String report;
    /** 接收时间。 */
    private String createdAt;
}
