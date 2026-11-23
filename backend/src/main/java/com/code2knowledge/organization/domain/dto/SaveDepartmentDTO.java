package com.code2knowledge.organization.domain.dto;

import lombok.Data;

/** 明确部门配置；更新须提交版本，根上级使用空串。 */
@Data
public class SaveDepartmentDTO {
    /** 上级UUID，根为空字符串。 */
    private String parentId;
    /** 同级唯一名称。 */
    private String name;
    /** 升序显示顺序。 */
    private Integer sortOrder;
    /** 当前部门启用状态，停用不授予部门资源。 */
    private Boolean enabled;
    /** 当前乐观版本。 */
    private Integer revision;
}
