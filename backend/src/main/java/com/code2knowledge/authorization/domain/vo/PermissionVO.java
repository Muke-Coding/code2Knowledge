package com.code2knowledge.authorization.domain.vo;

import lombok.Value;

/** 已实现权限目录；不预告尚未实现的知识或任务授权。 */
@Value
public class PermissionVO {
    /** 稳定权限动作码，只能选服务端已实现动作。 */
    String code;
    /** 权限显示名称，不为空。 */
    String name;
    /** 授权后实际能力与边界，不为空。 */
    String description;
}
