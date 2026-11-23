package com.code2knowledge.identity.domain.dto;
import lombok.Data;
/** 本人显示资料更新；不接受登录名、角色、部门或企业变更。 */
@Data
public class ProfileUpdateDTO {
    /** 本人显示名称，1到80字符，不为空。 */
    private String displayName;
    /** 已读取的显示资料版本，不可为空。 */
    private Integer revision;
}
