package com.code2knowledge.authorization.domain.vo;

import lombok.Value;

/** 角色公开视图；内置基础角色与可编辑企业角色统一展示。 */
@Value
public class RoleVO {
    /** 角色UUID或受保护内置标识。 */
    String id;
    /** 同企业角色名称，不为空。 */
    String name;
    /** 职责说明，允许空字符串。 */
    String description;
    /** 内置角色为真，不允许修改、删除或经接口分配。 */
    boolean builtIn;
    /** 角色并发编辑版本，从0递增。 */
    int revision;
    /** 角色动作集合，无动作为空数组。 */
    java.util.List<String> permissions;
}
