package com.code2knowledge.authorization.domain.vo;

import lombok.Value;

/** 成员自定义角色快照；基础角色由账户身份维护，不经此接口提升。 */
@Value
public class MemberRolesVO {
    /** 成员角色分配版本，提交时原样回传以防覆盖。 */
    int revision;
    /** 已分配自定义角色ID，空数组表示只保留基础身份。 */
    java.util.List<String> roleIds;
}
