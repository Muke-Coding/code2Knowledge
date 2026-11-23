package com.code2knowledge.authorization.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 角色持久化状态；只在授权服务内部使用，内置角色tenantId为空。 */
@Getter
@Setter
public class RoleDO {
    /** 角色UUID或内置标识。 */
    private String id;
    /** 归属企业，内置角色为null。 */
    private String tenantId;
    /** 角色名称，企业内唯一。 */
    private String name;
    /** 职责说明，允许空串。 */
    private String description;
    /** 受保护内置角色标志。 */
    private boolean builtIn;
    /** 编辑版本，从0递增。 */
    private int revision;
}
