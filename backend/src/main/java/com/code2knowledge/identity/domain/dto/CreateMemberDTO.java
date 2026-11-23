package com.code2knowledge.identity.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 管理员创建普通成员的请求；不支持在此接口提权为管理员。 */
@Getter
@Setter
public class CreateMemberDTO {
    /** 登录名，3到64位小写字母数字及点下划线横线，不为空。 */
    private String username;
    /** 显示名称，1到80字符，不为空。 */
    private String displayName;
    /** 初始密码，16到72个ASCII字符，不为空且不得记录。 */
    private String password;
}
