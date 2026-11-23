package com.code2knowledge.catalog.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 业务系统目录持久化对象，仅保存元数据，不含仓库与知识正文。 */
@Getter
@Setter
public class SystemDO {
    /** 系统UUID，不为空。 */
    private String id;
    /** 企业UUID，不为空。 */
    private String tenantId;
    /** 系统名称，不为空。 */
    private String name;
    /** 目录描述，可为空字符串，不能为null。 */
    private String description;
}
