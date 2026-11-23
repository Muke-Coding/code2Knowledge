package com.code2knowledge.identity.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 企业安全边界持久化对象，无Workspace特例。 */
@Getter
@Setter
public class TenantDO {
    /** 企业UUID，不为空。 */
    private String id;
    /** 企业名称，不为空。 */
    private String name;
}
