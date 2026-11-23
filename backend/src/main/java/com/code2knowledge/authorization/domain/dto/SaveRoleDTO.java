package com.code2knowledge.authorization.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 角色创建与更新请求，不接收企业或内置标志。 */
@Getter
@Setter
public class SaveRoleDTO {
    /** 同企业唯一角色名，1至80字符。 */
    private String name;
    /** 职责说明，null视为空，最多300字符。 */
    private String description;
    /** 必须显式提交的动作码数组；空数组表示无额外权限。 */
    private java.util.List<String> permissions;
    /** 编辑时必须提交最新版本；创建时允许null或0。 */
    private Integer revision;
}
