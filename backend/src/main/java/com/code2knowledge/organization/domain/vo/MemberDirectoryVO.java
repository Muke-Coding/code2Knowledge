package com.code2knowledge.organization.domain.vo;

import lombok.Value;

/** 用户管理部门筛选的最小关联视图；不含角色动作、源码或其他资源授权。 */
@Value
public class MemberDirectoryVO {
    /** 当前企业成员UUID，不为空。 */
    String memberId;
    /** 主部门UUID；未分配为空串，不隐式建立部门。 */
    String departmentId;
}
