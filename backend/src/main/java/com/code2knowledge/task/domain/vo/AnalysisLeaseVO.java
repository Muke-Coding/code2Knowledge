package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 独立协议的逆向租约，空租约其余字段为空；模型仅在运行时配置。 */
@Value
public class AnalysisLeaseVO {
    /** 是否领取到任务；false时其余文本为空、fence和sourceRevision为0。 */
    boolean available;
    /** 任务UUID，无任务为空。 */
    String taskId;
    /** 本次尝试UUID，无任务为空。 */
    String attemptId;
    /** 本次租约标识，不落日志。 */
    String leaseId;
    /** 尝试序号，旧尝试不能提交。 */
    int fence;
    /** 本机必须显式绑定的来源UUID。 */
    String sourceId;
    /** 本机来源绑定必须匹配的配置版本。 */
    int sourceRevision;
    /** 只解析该本地分支，不联网、不切换工作区。 */
    String branch;
    /** 产品稳定slug */
    String product;
    /** 业务域稳定slug */
    String domain;
    /** 明确业务范围，不是脚本 */
    String scope;
    /** 显式资料选择 */
    String documentsChoice;
    /** 全部固定来源快照 */
    java.util.List<AnalysisSourceVO> sources;
}
