package com.code2knowledge.organization.domain.vo;

import lombok.Value;

/** 部门资源授权事实；来源必须匹配当前配置版本，不授予角色动作。 */
@Value
public class DepartmentGrantVO {
    /** 被授权部门。 */
    String departmentId;
    /** SYSTEM目录或SOURCE分析。 */
    String resourceKind;
    /** 目标资源UUID。 */
    String resourceId;
    /** 授权时来源配置版本，目录使用0。 */
    int sourceRevision;
    /** 是否明确包含全部有效下级部门。 */
    boolean includeChildren;
    /** 当前是否有效；撤销保留版本记录，false不产生资源范围。 */
    boolean active;
    /** 授权乐观版本。 */
    int revision;
}
