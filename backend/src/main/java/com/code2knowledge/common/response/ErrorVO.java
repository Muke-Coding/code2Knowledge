package com.code2knowledge.common.response;

import lombok.Value;

/** 一致的HTTP失败契约；不返回堆栈、数据库信息或提交的密码。 */
@Value
public class ErrorVO {
    /** 稳定错误码，不为空。 */
    String code;
    /** 中文恢复提示，不为空。 */
    String message;
}
