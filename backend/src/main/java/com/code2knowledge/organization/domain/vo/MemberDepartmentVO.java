package com.code2knowledge.organization.domain.vo;

import lombok.Value;

/** 成员主部门分配；未分配使用空串，版本独立于登录身份。 */
@Value
public class MemberDepartmentVO {
    /** 主部门UUID，未分配为空串。 */
    String departmentId;
    /** 分配乐观版本。 */
    int revision;
}
