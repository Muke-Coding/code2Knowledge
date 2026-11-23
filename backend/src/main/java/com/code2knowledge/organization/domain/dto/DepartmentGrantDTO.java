package com.code2knowledge.organization.domain.dto;

import lombok.Data;

/** 部门授权显式写入或撤销；必须有相应资源授权动作。 */
@Data
public class DepartmentGrantDTO {
    /** 当前企业部门UUID。 */
    private String departmentId;
    /** 是否包含下级，不可为空。 */
    private Boolean includeChildren;
    /** 来源当前版本，目录为0，不可为空。 */
    private Integer sourceRevision;
    /** 授权当前版本；首次0，不可为空。 */
    private Integer revision;
}
