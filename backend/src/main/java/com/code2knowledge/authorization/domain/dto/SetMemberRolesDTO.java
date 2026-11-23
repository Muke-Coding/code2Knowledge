package com.code2knowledge.authorization.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 替换成员多角色请求；基础管理员不可由此获得或失去。 */
@Getter
@Setter
public class SetMemberRolesDTO {
    /** 必须显式提交同企业自定义角色数组；空数组撤销全部附加角色。 */
    private java.util.List<String> roleIds;
    /** 必须提交当前角色分配版本，防止并发覆盖。 */
    private Integer revision;
}
