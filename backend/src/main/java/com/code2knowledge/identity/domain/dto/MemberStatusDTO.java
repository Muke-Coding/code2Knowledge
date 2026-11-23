package com.code2knowledge.identity.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 管理员修改普通成员启用状态，不允许禁用管理员。 */
@Getter
@Setter
public class MemberStatusDTO {
    /** 目标启用状态，必填且不可为null。 */
    private Boolean enabled;
}
