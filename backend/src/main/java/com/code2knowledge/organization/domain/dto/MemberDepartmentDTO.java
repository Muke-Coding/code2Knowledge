package com.code2knowledge.organization.domain.dto;

import lombok.Data;

/** 成员主部门全量替换；空串明确移除，不隐式赋角色。 */
@Data
public class MemberDepartmentDTO {
    /** 主部门UUID，空串移除。 */
    private String departmentId;
    /** 当前分配版本，不可为空。 */
    private Integer revision;
}
