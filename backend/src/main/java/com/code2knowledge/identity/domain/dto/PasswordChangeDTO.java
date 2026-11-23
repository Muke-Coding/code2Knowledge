package com.code2knowledge.identity.domain.dto;
import lombok.Getter;
import lombok.Setter;
/** 本人密码变更请求；不生成toString，不记录或返回两个明文值。 */
@Getter
@Setter
public class PasswordChangeDTO {
    /** 当前密码，仅用于本次验证，不可为空。 */
    private String currentPassword;
    /** 新密码，16到72个非空格ASCII字符，不可为空。 */
    private String newPassword;
}
