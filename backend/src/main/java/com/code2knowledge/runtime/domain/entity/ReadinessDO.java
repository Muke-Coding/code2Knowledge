package com.code2knowledge.runtime.domain.entity;

import lombok.Data;

/** 短期就绪诊断持久化对象；只由本企业所有者及指定设备访问，不表示任务租约。 */
@Data
public class ReadinessDO {
    /** 本次UUID。 */
    private String id;
    /** 可信企业UUID。 */
    private String tenantId;
    /** 请求成员UUID。 */
    private String ownerId;
    /** 本人指定设备UUID。 */
    private String deviceId;
    /** 检查状态：PENDING/CHECKING/COMPLETE。 */
    private String state;
    /** 固定平台来源快照JSON。 */
    private String sourcesJson;
    /** 固定脱敏检查JSON。 */
    private String checksJson;
    /** 平台UTC期限。 */
    private String expiresAt;
    /** 数据库时钟判断是否过期。 */
    private boolean expired;
}
