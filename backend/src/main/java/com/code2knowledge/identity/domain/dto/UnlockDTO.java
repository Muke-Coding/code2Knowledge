package com.code2knowledge.identity.domain.dto;
import lombok.Getter;
import lombok.Setter;
/** 当前会话解锁输入；不能选择其他账户，不生成含凭证的toString。 */
@Getter
@Setter
public class UnlockDTO {
    /** 当前会话所属账户的现行密码，仅用于本次校验。 */
    private String password;
}
